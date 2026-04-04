const fetch = require("node-fetch");

const TINYFISH_API = "https://agent.tinyfish.ai/v1/automation/run-sse";

// Run a single TinyFish agent and return parsed result
async function runAgent(url, goal) {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) throw new Error("TINYFISH_API_KEY not set");

  const res = await fetch(TINYFISH_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      goal,
      browser_profile: "stealth",
    }),
  });

  if (!res.ok) {
    throw new Error(`TinyFish error: ${res.status}`);
  }

  // Read SSE stream until COMPLETE
  const text = await res.text();
  const lines = text.split("\n");

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === "COMPLETE" && data.status === "COMPLETED") {
          // Try to parse resultJson first, fall back to result
          if (data.resultJson) return data.resultJson;
          if (data.result) {
            try {
              return JSON.parse(data.result);
            } catch {
              return { raw: data.result };
            }
          }
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  return null;
}

// Check all services in parallel
async function checkServices(services) {
  console.log(`Checking ${services.length} services in parallel...`);

  const checks = services.map((service) => checkOneService(service));
  const results = await Promise.allSettled(checks);

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.error(`Failed to check ${services[i]}:`, r.reason?.message);
    return {
      service: services[i],
      score: null,
      error: r.reason?.message || "Check failed",
      signals: {},
    };
  });
}

// Run all 4 agents for one service in parallel (trimmed to 4 to save credits)
async function checkOneService(service) {
  const slug = service.toLowerCase().replace(/\s+/g, "-");

  console.log(`Checking: ${service}`);

  const [statusResult, blogResult, hnResult, pricingResult] = await Promise.allSettled([
    // Agent 1 — Status page
    runAgent(
      `https://www.google.com/search?q=${encodeURIComponent(service + " status page")}`,
      `You are on Google search results. Read only visible titles and snippets — do NOT click, do NOT scroll.
Find the official ${service} status page URL. Navigate to it.
On the status page: read current status and last 2 visible incidents only. Do NOT click incidents. Stop immediately after reading.
Return ONLY valid JSON: {"current_status": "operational|degraded|outage|unknown", "recent_incidents": ["..."], "incident_count_visible": N}`
    ),

    // Agent 2 — Deprecation/pricing signals from blog/changelog
    runAgent(
      `https://www.google.com/search?q=${encodeURIComponent(service + " deprecated OR shutdown OR pricing change OR end of life 2024 OR 2025 OR 2026")}`,
      `You are on Google search results. Read only visible titles and snippets — do NOT click anything.
Look for: price increases, tier removals, deprecations, shutdown notices, API version EOL. Ignore general blog posts.
Cap at 8 results. Stop immediately after reading.
Return ONLY valid JSON: {"deprecation_found": true|false, "signals": [{"title": "...", "summary": "...", "severity": "low|medium|high"}]}`
    ),

    // Agent 3 — Hacker News community sentiment
    runAgent(
      `https://hn.algolia.com/?q=${encodeURIComponent(service + " dying OR shutdown OR alternative OR pricing")}&dateRange=pastYear&type=story`,
      `You are on Hacker News Algolia search. Read only visible story titles and point counts — do NOT click anything, do NOT scroll.
Look for: shutdown rumours, pricing complaints, people asking for alternatives.
Cap at 10 results. Stop immediately.
Return ONLY valid JSON: {"sentiment": "positive|neutral|negative", "negative_stories": [{"title": "...", "points": N}]}`
    ),

    // Agent 4 — Pricing page (free tier check)
    runAgent(
      `https://www.google.com/search?q=${encodeURIComponent(service + " pricing")}`,
      `You are on Google search results. Read only visible results — do NOT click, do NOT scroll.
Find the official ${service} pricing page URL. Navigate to it.
On the pricing page: read only visible plan names and prices. Look for: "free tier removed", "price increase", "plan discontinued", banners/notices. Do NOT scroll, do NOT click.
Stop immediately after reading.
Return ONLY valid JSON: {"free_tier_exists": true|false, "pricing_change_signals": ["..."], "plans_visible": ["..."]}`
    ),
  ]);

  const status = statusResult.status === "fulfilled" ? statusResult.value : null;
  const blog = blogResult.status === "fulfilled" ? blogResult.value : null;
  const hn = hnResult.status === "fulfilled" ? hnResult.value : null;
  const pricing = pricingResult.status === "fulfilled" ? pricingResult.value : null;

  // Score the service
  const score = scoreService({ status, blog, hn, pricing });

  return {
    service,
    score,
    signals: { status, blog, hn, pricing },
  };
}

function scoreService({ status, blog, hn, pricing }) {
  let score = 10;

  // Status signal (max -3)
  if (status) {
    if (status.current_status === "outage") score -= 3;
    else if (status.current_status === "degraded") score -= 1.5;
    if (status.incident_count_visible > 3) score -= 0.5;
  }

  // Blog/deprecation signal (max -4)
  if (blog) {
    if (blog.deprecation_found) score -= 4;
    else {
      const highSignals = (blog.signals || []).filter((s) => s.severity === "high").length;
      const medSignals = (blog.signals || []).filter((s) => s.severity === "medium").length;
      score -= highSignals * 1.5 + medSignals * 0.5;
    }
  }

  // HN sentiment (max -2)
  if (hn) {
    if (hn.sentiment === "negative") score -= 2;
    else if (hn.sentiment === "neutral") score -= 0.5;
    const highPointNeg = (hn.negative_stories || []).filter((s) => s.points > 100).length;
    score -= highPointNeg * 0.5;
  }

  // Pricing signal (max -3)
  if (pricing) {
    if (!pricing.free_tier_exists) score -= 1;
    const pricingSignals = pricing.pricing_change_signals || [];
    score -= Math.min(pricingSignals.length * 0.5, 2);
  }

  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

module.exports = { checkServices };
