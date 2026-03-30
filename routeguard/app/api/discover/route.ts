import { NextRequest, NextResponse } from "next/server";

const GROQ_KEY = process.env.GROQ_API_KEY || "";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function POST(req: NextRequest) {
  try {
    const { origin, destination, cargo, departureDate } = await req.json();

    const today = new Date().toISOString().split("T")[0];

    const systemPrompt = `You are a maritime intelligence research planner. Given a shipping route, identify the 7 BEST publicly accessible websites to scrape for risk intelligence.

RULES:
1. Return exactly 7 real URLs — no login-required sites
2. NEVER include government websites (.gov, .mil, .gov.sg, .gov.eg, .gov.cn, .gov.uk, .gov.au, .gouv.fr, .govt.nz, or any other government domain) — use commercial and industry sources only
3. Cover these categories — maritime_news(2), weather(1), freight_rates(2), geopolitical(1), supply_chain(1)
4. Pick sources SPECIFIC to the route geography — trade lane, chokepoints, oceans crossed
5. Every URL must be a real, publicly accessible page

PREFERRED SOURCES (pick what fits the route):
- maritime_news: gcaptain.com, maritime-executive.com, hellenicshippingnews.com, splash247.com, tradewindsnews.com
- weather: zoom.earth, windy.com, passageweather.com
- freight_rates: theloadstar.com, freightos.com/freight-resources/global-freight-index/, drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index
- geopolitical: icc-ccs.org/piracy-reporting-centre, reuters.com/business/shipping
- supply_chain: supplychaindive.com

Return ONLY this JSON (no markdown, no preamble):
{
  "urls": [
    {
      "url": "https://example.com/page",
      "source_name": "Name",
      "category": "maritime_news|weather|freight_rates|geopolitical|supply_chain",
      "goal": "One sentence stating exactly what to extract, referencing specific ports/canals/chokepoints on this route. Do NOT click links or navigate away from this page."
    }
  ]
}`;

    const userPrompt = `Route: ${origin} → ${destination}
Cargo: ${cargo}
Departure: ${departureDate}
Today: ${today}

Return 7 non-government URLs covering maritime_news(2), weather(1), freight_rates(2), geopolitical(1), supply_chain(1) for this route.`;

    if (!GROQ_KEY) {
      return NextResponse.json({ urls: buildSmartFallback(origin, destination) });
    }

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq discover error:", response.status, errText);
      return NextResponse.json({ urls: buildSmartFallback(origin, destination) });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ urls: buildSmartFallback(origin, destination) });
    }

    let result;
    try {
      const clean = content.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      result = JSON.parse(clean);
    } catch {
      console.error("Groq discover parse error:", content?.substring(0, 300));
      return NextResponse.json({ urls: buildSmartFallback(origin, destination) });
    }

    const urls = result.urls || [];

    if (urls.length < 5) {
      console.warn("Groq returned fewer than 5 URLs, using fallback");
      return NextResponse.json({ urls: buildSmartFallback(origin, destination) });
    }

    return NextResponse.json({ urls: urls.slice(0, 7) });
  } catch (error: any) {
    console.error("Discover error:", error);
    return NextResponse.json({ urls: buildSmartFallback("", "") });
  }
}

function buildSmartFallback(origin: string, destination: string) {
  const route = `${origin} → ${destination}`;
  return [
    {
      url: "https://gcaptain.com",
      source_name: "gCaptain",
      category: "maritime_news",
      goal: `Extract 5 headlines on shipping disruptions, port delays, strikes, or weather events relevant to ${route}. Include port names and delay estimates. Do NOT click links or navigate away from this page.`,
    },
    {
      url: "https://www.hellenicshippingnews.com",
      source_name: "Hellenic Shipping News",
      category: "maritime_news",
      goal: `Extract 5 headlines on freight markets, port operations, and maritime risk affecting the ${route} trade lane. Include rate and delay figures. Do NOT click links or navigate away from this page.`,
    },
    {
      url: "https://www.passageweather.com",
      source_name: "Passage Weather",
      category: "weather",
      goal: `Extract current wind, wave, and storm conditions for the ocean regions on the ${route} corridor. Note speed/height values and affected areas. Do NOT click links or navigate away from this page.`,
    },
    {
      url: "https://theloadstar.com",
      source_name: "The Loadstar",
      category: "freight_rates",
      goal: `Extract the latest freight rate headlines, % changes, and supply chain disruptions affecting ${route}. Note specific rate figures and dwell times. Do NOT click links or navigate away from this page.`,
    },
    {
      url: "https://www.freightos.com/freight-resources/global-freight-index/",
      source_name: "Freightos Baltic Index",
      category: "freight_rates",
      goal: `Extract FBX rate figures for trade lanes relevant to ${route}. Note USD/FEU, week-on-week % change, and market commentary. Do NOT click links or navigate away from this page.`,
    },
    {
      url: "https://www.icc-ccs.org/piracy-reporting-centre",
      source_name: "ICC Piracy Reporting Centre",
      category: "geopolitical",
      goal: `Extract current piracy incident reports and security advisories. Note incident locations and threats relevant to ${route}. Do NOT click links or navigate away from this page.`,
    },
    {
      url: "https://www.supplychaindive.com",
      source_name: "Supply Chain Dive",
      category: "supply_chain",
      goal: `Extract 5 headlines on port disruptions, logistics delays, and freight movements affecting ${route}. Include specific figures. Do NOT click links or navigate away from this page.`,
    },
  ];
}
