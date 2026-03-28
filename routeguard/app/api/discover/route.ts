import { NextRequest, NextResponse } from "next/server";

const GROQ_KEY = process.env.GROQ_API_KEY || "";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function POST(req: NextRequest) {
  try {
    const { origin, destination, cargo, departureDate } = await req.json();

    const today = new Date().toISOString().split("T")[0];

    const systemPrompt = `You are a maritime intelligence research planner. Given any shipping route, you identify the BEST real websites to scrape for comprehensive risk intelligence — covering weather, port operations, freight rates, geopolitical security, and maritime news.

Your job: return 15 real, publicly accessible URLs tailored to the SPECIFIC route provided. Think about:
- Which oceans, seas, straits, and canals does this route pass through?
- Which specific port authority websites serve the origin and destination ports?
- Which regional weather services cover those ocean regions?
- Which freight indices track that trade lane?
- Which security agencies monitor that corridor?

RULES:
1. Return REAL URLs that actually exist and are publicly accessible (no login required)
2. Spread across ALL 6 categories — minimum per category: maritime_news(4), weather(2), port_authority(2), freight_rates(2), geopolitical(2), supply_chain(1)
3. Prioritise sources SPECIFIC to the route's geography — e.g. Japan→Brazil should include JTWC (Pacific storms), Brazilian port authority, transpacific freight indices
4. For port authorities: use the actual official port or maritime authority websites for those specific ports/countries
5. For weather: use regional services relevant to the oceans this route crosses
6. Do NOT just use generic global sites for everything — pick the best fit per route

ALWAYS INCLUDE (these cover any route):
- https://gcaptain.com (maritime_news) 
- https://www.maritime-executive.com (maritime_news)
- https://theloadstar.com (freight_rates)
- https://www.nhc.noaa.gov (weather — Atlantic/Pacific storms)
- https://www.icc-ccs.org/piracy-reporting-centre (geopolitical)
- https://www.imo.org/en/MediaCentre/Pages/WhatsNew.aspx (geopolitical)
- https://www.freightos.com/freight-resources/global-freight-index/ (freight_rates)

ROUTE-SPECIFIC EXAMPLES (use this logic, don't copy blindly):
- Asia↔Europe via Suez: include https://www.suezcanal.gov.eg, https://www.hellenicshippingnews.com, Red Sea weather
- Trans-Pacific: include https://www.pancanal.com or JTWC typhoon center, Pacific freight indices
- Intra-Asia: include MPA Singapore https://www.mpa.gov.sg, regional port authority sites
- Europe↔Americas: include Panama Canal, Atlantic weather, Rotterdam/Hamburg port sites
- Africa routes: include Cape of Good Hope maritime safety, regional port authorities
- Middle East: include Gulf maritime safety, Strait of Hormuz monitoring

Return ONLY this JSON (no markdown, no explanation):
{
  "urls": [
    {
      "url": "https://example.com/specific-page",
      "source_name": "Human readable name",
      "category": "maritime_news|weather|port_authority|freight_rates|geopolitical|supply_chain",
      "goal": "Specific scraping instruction for this route mentioning the exact ports/canals/chokepoints/weather patterns relevant to this voyage. Tell the agent exactly what to look for. End with: Do NOT click links or navigate away from this page."
    }
  ]
}`;

    const userPrompt = `Route: ${origin} → ${destination}
Cargo: ${cargo}
Departure: ${departureDate}
Today: ${today}

First, think about this route's geography:
- What seas/oceans does it cross?
- What chokepoints or canals does it likely pass through?
- What are the origin and destination port authorities?
- What regional weather services cover these waters?
- What security risks exist on this corridor?

Then return 15 URLs covering all 6 categories, tailored specifically to this route.`;

    if (!GROQ_KEY) {
      // No API key — return a small smart fallback set
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
        max_tokens: 4000,
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

    if (urls.length < 8) {
      console.warn("Groq returned fewer than 8 URLs, using fallback");
      return NextResponse.json({ urls: buildSmartFallback(origin, destination) });
    }

    return NextResponse.json({ urls: urls.slice(0, 15) });
  } catch (error: any) {
    console.error("Discover error:", error);
    return NextResponse.json({ urls: buildSmartFallback("", "") });
  }
}

// Minimal fallback — only used if Groq completely fails
// Generic enough to work for any route
function buildSmartFallback(origin: string, destination: string) {
  const route = `${origin} → ${destination}`;
  return [
    {
      url: "https://gcaptain.com",
      source_name: "gCaptain",
      category: "maritime_news",
      goal: `Extract the latest 5–7 news headlines about shipping disruptions, port delays, strikes, canal congestion, and weather events. Focus on anything relevant to the ${route} trade lane. Return headline + 2-sentence summary with specific port names and delay estimates. Do NOT click links or navigate away.`,
    },
    {
      url: "https://www.maritime-executive.com",
      source_name: "Maritime Executive",
      category: "maritime_news",
      goal: `Extract the latest 5–7 articles about shipping disruptions, port congestion, freight rates, or weather alerts. Prioritise items affecting the ${route} corridor. Include delay figures and rate changes. Do NOT click links or navigate away.`,
    },
    {
      url: "https://theloadstar.com",
      source_name: "The Loadstar",
      category: "freight_rates",
      goal: `Extract the latest headlines on freight rates, port congestion, and supply chain disruptions. Note specific rate figures, % changes, and dwell times relevant to ${route}. Do NOT click links or navigate away.`,
    },
    {
      url: "https://www.hellenicshippingnews.com",
      source_name: "Hellenic Shipping News",
      category: "maritime_news",
      goal: `Extract 5–7 headlines about freight markets, port operations, and maritime risk. Focus on anything affecting the ${route} trade lanes. Include rate and delay figures where visible. Do NOT click links or navigate away.`,
    },
    {
      url: "https://splash247.com",
      source_name: "Splash247",
      category: "maritime_news",
      goal: `Extract top 5–7 headlines about disruptions, strikes, weather, or congestion. Focus on chokepoint or port issues affecting ${route}. Do NOT click links or navigate away.`,
    },
    {
      url: "https://www.nhc.noaa.gov",
      source_name: "NOAA Hurricane Center",
      category: "weather",
      goal: `Extract all current tropical storm or hurricane advisories, warnings, and forecasted tracks visible. Note storm names, intensity, and which shipping lanes on ${route} may be affected. Do NOT click links or navigate away.`,
    },
    {
      url: "https://www.metoc.navy.mil/jtwc/jtwc.html",
      source_name: "JTWC Tropical Weather",
      category: "weather",
      goal: `Extract all current tropical cyclone warnings and significant weather advisories. Note storm locations, wind speeds, and threats to shipping on the ${route} corridor. Do NOT click links or navigate away.`,
    },
    {
      url: "https://www.freightos.com/freight-resources/global-freight-index/",
      source_name: "Freightos Baltic Index",
      category: "freight_rates",
      goal: `Extract the latest FBX rate figures for trade lanes relevant to ${route}. Note rate per FEU, week-on-week percentage change, and market commentary. Do NOT click links or navigate away.`,
    },
    {
      url: "https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index",
      source_name: "Drewry WCI",
      category: "freight_rates",
      goal: `Extract the latest World Container Index figures and rate changes relevant to the ${route} trade lane. Include USD/FEU figures and week-on-week changes. Do NOT click links or navigate away.`,
    },
    {
      url: "https://www.icc-ccs.org/piracy-reporting-centre",
      source_name: "ICC Piracy Reporting Centre",
      category: "geopolitical",
      goal: `Extract all current piracy incident reports, armed robbery alerts, and security advisories. Note incident locations, vessel types, and any threats relevant to ${route}. Do NOT click links or navigate away.`,
    },
    {
      url: "https://www.imo.org/en/MediaCentre/Pages/WhatsNew.aspx",
      source_name: "IMO Maritime Org",
      category: "geopolitical",
      goal: `Extract the latest IMO news, circulars, and maritime safety notices relevant to ${route}. Note new regulations, safety alerts, or international incidents. Do NOT click links or navigate away.`,
    },
    {
      url: "https://www.reuters.com/business/shipping",
      source_name: "Reuters Shipping",
      category: "geopolitical",
      goal: `Extract the latest Reuters headlines on shipping, maritime trade, and supply chains. Focus on disruptions and geopolitical risks affecting ${route}. Include specific ports and economic impact. Do NOT click links or navigate away.`,
    },
    {
      url: "https://www.supplychaindive.com",
      source_name: "Supply Chain Dive",
      category: "supply_chain",
      goal: `Extract the latest 5–7 supply chain headlines about port disruptions, logistics delays, and freight market movements affecting ${route}. Include specific figures. Do NOT click links or navigate away.`,
    },
    {
      url: "https://www.tradewindsnews.com",
      source_name: "TradeWinds",
      category: "maritime_news",
      goal: `Extract the latest 5 headlines about shipping markets, fleet disruptions, and trade lane developments relevant to ${route}. Include rate movements or vessel delays. Do NOT click links or navigate away.`,
    },
    {
      url: "https://www.suezcanal.gov.eg/English/Pages/default.aspx",
      source_name: "Suez Canal Authority",
      category: "port_authority",
      goal: `Extract any current notices, transit restrictions, fee changes, or operational updates visible. Note convoy schedules, vessel restrictions, or congestion alerts that could affect ${route}. Do NOT click links or navigate away.`,
    },
  ];
}
