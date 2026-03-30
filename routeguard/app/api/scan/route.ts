import { NextRequest } from "next/server";

const TINYFISH_KEY = process.env.TINYFISH_API_KEY || "";
const GROQ_KEY = process.env.GROQ_API_KEY || "";
const TINYFISH_URL = "https://agent.tinyfish.ai/v1/automation/run-sse";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// ─── TINYFISH SSE SCRAPER ─────────────────────────────────────────────────────
async function scrapeSite(
  url: string,
  goal: string,
  sourceName: string,
  category: string,
  onProgress: (type: string, payload: Record<string, unknown>) => void
) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    const res = await fetch(TINYFISH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": TINYFISH_KEY },
      body: JSON.stringify({
        url,
        browser_profile: "stealth",
        proxy_config: { enabled: true, country_code: "US" },
        goal: `ROLE: Fast maritime intelligence extractor. SOURCE: ${category.replace(/_/g, " ").toUpperCase()}
STRICT RULES — no exceptions:
- Do NOT click any link, button, menu, popup, cookie banner, or ad
- Read ONLY what is visible on the current page
- Complete in under 40 seconds
- If a popup appears, ignore it and read around it — do not interact

TASK: ${goal}

EXTRACT exactly 5 items visible on this page. Output as plain bullets only:
• [Headline] — [1–2 sentences with specific data: ${
  category === "weather"
    ? "storm name, wind speed, wave height, affected region"
    : category === "freight_rates"
    ? "USD/FEU rate, % week-on-week change, trade lane"
    : category === "geopolitical"
    ? "incident location, vessel name, threat type"
    : category === "supply_chain"
    ? "dwell time, equipment shortage, schedule reliability %"
    : "port name, delay hours, congestion %, rate change"
}]
Stop after 5 bullets. Do not summarise, explain, or add commentary.`,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      onProgress("error", { message: `HTTP ${res.status}` });
      return { source: sourceName, url, category, data: "", success: false, streaming_url: null };
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalData = "";
    let streaming_url: string | null = null;
    let success = false;

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const event = JSON.parse(raw);
          switch (event.type) {
            case "STARTED": onProgress("started", { run_id: event.run_id }); break;
            case "STREAMING_URL":
              streaming_url = event.streaming_url || null;
              onProgress("streaming_url", { streaming_url });
              break;
            case "PROGRESS": onProgress("progress", { purpose: event.purpose || "Working…" }); break;
            case "HEARTBEAT": break;
            case "COMPLETE":
              if (event.status === "COMPLETED") {
                success = true;
                const r = event.result;
                finalData = typeof r === "string" ? r : JSON.stringify(r ?? {});
              } else {
                onProgress("error", { message: event.error || "Agent did not complete" });
              }
              break;
          }
        } catch { /* skip malformed */ }
      }
    }

    return { source: sourceName, url, category, data: finalData.substring(0, 3000), success, streaming_url };
  } catch (error: any) {
    const msg = error.name === "AbortError" ? "Timed out after 90s" : error.message;
    onProgress("error", { message: msg });
    return { source: sourceName, url, category, data: "", success: false, streaming_url: null };
  }
}

// ─── GROQ ANALYSIS ────────────────────────────────────────────────────────────
async function analyseWithGroq(
  results: { source: string; url: string; category: string; data: string; success: boolean }[],
  origin: string,
  destination: string,
  cargo: string,
  departureDate: string
) {
  const byCategory: Record<string, typeof results> = {};
  for (const r of results) {
    const cat = r.category || "maritime_news";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(r);
  }

  const formatSection = (cat: string, label: string) => {
    const items = byCategory[cat] || [];
    if (items.length === 0) return "";
    const content = items.map(r =>
      `  [${r.source}] ${r.success ? "✓" : "✗ FAILED"}\n  ${r.success ? r.data : "(unavailable)"}`
    ).join("\n\n");
    return `\n=== ${label} ===\n${content}`;
  };

  const structuredData = [
    formatSection("weather", "WEATHER INTELLIGENCE"),
    formatSection("freight_rates", "FREIGHT RATE DATA"),
    formatSection("geopolitical", "GEOPOLITICAL & SECURITY"),
    formatSection("maritime_news", "MARITIME NEWS"),
    formatSection("supply_chain", "SUPPLY CHAIN"),
  ].filter(Boolean).join("\n\n");

  const today = new Date().toISOString().split("T")[0];

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert global shipping risk intelligence AI. Your job is to produce REALISTIC, CALIBRATED risk assessments — not dramatic, not alarmist. Base everything on the actual data provided.

══════════════════════════════════════
STEP 1: EXTRACT SIGNALS FROM RAW DATA
══════════════════════════════════════
From the raw input, identify:

WEATHER:
- wind_speed (estimate if mentioned qualitatively; typical threshold: >40 knots = significant)
- wave_height (if available; >4m = significant)
- storm_alert (true ONLY if active storm/typhoon/depression is confirmed near the route)

PORT CONDITIONS:
- port_delays (hours; only count confirmed delays, not forecasts)
- congestion_level (low/medium/high; only from port authority or official data)

GEOPOLITICAL:
- keywords present: conflict, tension, sanctions, war, naval, military, piracy
- severity: low (diplomatic only) / moderate (active incidents nearby) / high (direct route threat)

FREIGHT:
- rate_change_percent (from actual index data only; if not found mark unknown)

SUPPLY CHAIN:
- delays_mentioned (count distinct mentions; 1-2 = minor, 3+ = significant)
- rerouting (true only if confirmed, not speculative)

IMPORTANT: If a number is not in the data, estimate CONSERVATIVELY. Mark assumptions clearly. Never invent incidents.

══════════════════════════════════════
STEP 2: APPLY RISK SCORING MODEL
══════════════════════════════════════
Start from 0. Add points only for CONFIRMED or HIGHLY PROBABLE conditions:

Weather:
- wind_speed > 40kt confirmed → +2
- active storm alert on/near route → +3
- wave_height > 4m confirmed → +2

Port:
- delay > 24h confirmed → +2
- delay > 48h confirmed → +3
- congestion high/>80% confirmed → +2

Geopolitical:
- active tension keywords in data → +2
- military/naval activity near route → +3
- multiple strong direct threats → +4

Freight:
- rate increase >5% confirmed → +2
- rate increase >10% confirmed → +3

Supply Chain:
- delays mentioned 3+ times → +2
- rerouting confirmed → +2

Score → Level:
0-3 = LOW (routine voyage, normal conditions)
4-7 = MEDIUM (elevated caution, monitor conditions)
8-12 = HIGH (significant disruption likely, consider alternatives)
13+ = CRITICAL (major disruption, strong rerouting recommendation)

CALIBRATION RULES (critical — read carefully):
- A score of 8-12 (HIGH) means delays of roughly 3-10 days and freight increases of 10-25%
- A score of 13+ (CRITICAL) means delays of 10+ days and freight increases of 25%+
- Do NOT assign HIGH or CRITICAL unless the scraped data actually contains strong signals
- Most routine routes with no active incidents = LOW (0-3) or MEDIUM (4-7)
- Do not round up risk scores to seem more thorough — be honest
- expected_delay_days should match risk level: LOW=0-1, MEDIUM=1-3, HIGH=3-10, CRITICAL=10+
- freight_change_percent should match: LOW=0-5%, MEDIUM=5-15%, HIGH=15-30%, CRITICAL=30%+

══════════════════════════════════════
STEP 3: OUTPUT FORMAT
══════════════════════════════════════
Return ONLY valid JSON — no markdown, no explanation:
{
  "risk_score": <0-20 integer, the sum from Step 2>,
  "risk_level": <"LOW"|"MEDIUM"|"HIGH"|"CRITICAL">,
  "confidence": <40-90 integer; lower if few sources succeeded>,
  "verdict": "<2-3 sentences. State what the data actually shows. Name specific signals found. Give a realistic forward outlook. Do NOT dramatise. Do NOT use adjectives like 'severe' or 'alarming' unless the score is CRITICAL.>",
  "expected_delay_days": <integer matching risk level>,
  "freight_change_percent": <integer matching risk level, can be 0 or negative>,
  "estimated_arrival": "<DD-MM-YYYY>",
  "resolution_date": "<DD-MM-YYYY>",
  "signals": [
    {
      "source": "<source name, or 'Expert Analysis' for inferred>",
      "category": "<weather|port_authority|freight_rates|geopolitical|maritime_news|supply_chain>",
      "risk": "<HIGH|MEDIUM|LOW>",
      "finding": "<1-2 sentences. Specific facts only. If inferred, say 'Based on typical conditions for this route and season...'>"
    }
  ],
  "alternatives": [
    {
      "name": "<specific route name with waypoints>",
      "transit_days": <realistic integer>,
      "cost_change": "<+X% or -X% or 0%>",
      "risk_score": <integer 0-20>,
      "description": "<1 sentence with actual tradeoffs>",
      "recommended": <true only for the genuinely best option>
    }
  ],
  "risk_breakdown": {
    "port_disruption": <0-100, proportion of total risk from this category>,
    "freight_surge": <0-100>,
    "weather": <0-100>,
    "geopolitical": <0-100>,
    "other": <0-100>
  },
  "timeline_events": [
    {"date": "<DD-MM-YYYY>", "label": "<max 3 words>", "type": "<departure|waypoint|risk|resolution|arrival>"}
  ]
}

MINIMUMS: 6+ signals, 3+ alternatives, 8+ timeline events (include key port calls and chokepoints as waypoints).
HONESTY RULE: If the data shows nothing alarming, say so. A LOW risk result is a valid and useful result.`,
        },
        {
          role: "user",
          content: `ROUTE: ${origin} → ${destination}
CARGO: ${cargo}
DEPARTURE: ${departureDate}
TODAY: ${today}
SOURCES: ${results.length} scraped (${results.filter(r => r.success).length} succeeded)

${structuredData}

Instructions:
1. Work through Steps 1-3 mentally before producing JSON
2. Only score risks that appear in the data above — do not invent incidents
3. Trace the actual route geography: which seas, straits, canals does this vessel cross?
4. Use DD-MM-YYYY date format throughout
5. The verdict must be honest — if it's a calm route, say so clearly
6. Include waypoint timeline events for each major port call and chokepoint on the route

Produce the JSON now.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq analysis failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "";
  const clean = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    return JSON.parse(clean);
  } catch {
    console.error("Groq JSON parse error:", clean.substring(0, 500));
    throw new Error("Failed to parse Groq analysis response");
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { urls, origin, destination, cargo, departureDate } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (_) {}
      };

      try {
        const total: number = urls.length;
        send("status", { message: `Deploying ${total} agents across weather, ports, freight & news…`, step: 2 });

        let completedCount = 0;

        const promises = (urls as { url: string; goal: string; source_name: string; category?: string }[]).map((u, i) =>
          scrapeSite(u.url, u.goal, u.source_name, u.category || "maritime_news", (type, payload) => {
            send("agent_progress", { index: i, type, category: u.category || "maritime_news", ...payload });
          }).then((result) => {
            completedCount++;
            send("agent_done", {
              index: i,
              source: result.source,
              url: result.url,
              category: result.category,
              success: result.success,
              preview: result.success ? result.data.substring(0, 150) : "",
              streaming_url: result.streaming_url,
              completed: completedCount,
              total,
            });
            return result;
          })
        );

        const results = await Promise.all(promises);
        const successCount = results.filter(r => r.success).length;

        send("status", {
          message: `${successCount}/${total} sources collected — running calibrated risk analysis…`,
          step: 3,
        });

        const analysis = await analyseWithGroq(results, origin, destination, cargo, departureDate);
        send("analysis", analysis);
        send("complete", { success: true });
      } catch (error: any) {
        console.error("Scan pipeline error:", error);
        send("error", { message: error.message || "Analysis failed" });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
