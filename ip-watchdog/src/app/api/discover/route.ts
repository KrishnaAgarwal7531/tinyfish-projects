import { NextRequest, NextResponse } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL    = "llama-3.3-70b-versatile";

const REGISTRIES = [
  { id: "uspto",   name: "USPTO",    url: "https://tmsearch.uspto.gov",                                                                             region: "United States" },
  { id: "euipo",   name: "EUIPO",    url: "https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=BRAND_PLACEHOLDER",region: "European Union" },
  { id: "ukipo",   name: "UKIPO",    url: "https://trademarks.ipo.gov.uk/ipo-tmtext/page/search?text=BRAND_PLACEHOLDER&searchType=wordSearch",       region: "United Kingdom" },
  { id: "wipo",    name: "WIPO",     url: "https://branddb.wipo.int/en/quicksearch?by=brandName&v=BRAND_PLACEHOLDER",                               region: "International (130+ countries)" },
  { id: "cipo",    name: "CIPO",     url: "https://ised-isde.canada.ca/cipo/trademark-search/srch?null&search=BRAND_PLACEHOLDER",                   region: "Canada" },
  { id: "ipindia", name: "IP India", url: "https://ipindiaonline.gov.in/tmrpublicsearch/frmmain.aspx",                                              region: "India" },
  { id: "tmview",  name: "TMview",   url: "https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=BRAND_PLACEHOLDER",region: "70+ Countries" },
];

export async function POST(req: NextRequest) {
  try {
    const { brand_name, classes, registry_ids } = await req.json();
    if (!brand_name?.trim()) {
      return NextResponse.json({ error: "brand_name is required" }, { status: 400 });
    }

    // Filter to only requested registries
    const activeRegistries = registry_ids && registry_ids.length > 0
      ? REGISTRIES.filter(r => registry_ids.includes(r.id))
      : REGISTRIES;

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a trademark search expert. Your job is to:
1. Generate phonetic, visual, and spelling variants of a brand name that could be confusingly similar trademarks
2. Create detailed TinyFish browser agent goals for each registry to search for the original name AND all variants

VARIANT GENERATION RULES:
- Generate 8-12 variants covering: phonetic similarity, common misspellings, word splits/merges, prefix/suffix swaps, letter substitutions (e, i, y; c, k, q; f, ph; etc.)
- Examples for "MamaEarth": MammaEarth, Mama Earth, MamaEarthy, MamaEarth, MomEarth, MamaBirth, MamaEarsh, MamaEarths, MammaEarth, MamaEarths, MamaUarth
- Examples for "NexaTech": NexaTek, NexaText, NextaTech, Nexa Tech, NexaTec, NixaTech, NeksaTech, NexaTech

GOAL GENERATION RULES:
- Each agent goal must instruct the agent to search for the original brand name PLUS each variant
- The agent should: navigate to the search URL, search each name variant one by one, click into results, extract mark details
- Return all found marks as JSON with: mark_name, applicant, filing_date, status, classes, jurisdiction

Return ONLY valid JSON:
{
  "brand_name": "string",
  "variations": ["array of 8-12 phonetic/spelling variants"],
  "sources": [
    {
      "id": "registry id",
      "name": "registry name",
      "icon": "flag emoji",
      "region": "string",
      "url": "the search URL with brand name pre-filled where possible",
      "goal": "detailed multi-step TinyFish goal string"
    }
  ]
}`,
          },
          {
            role: "user",
            content: `Brand name to protect: "${brand_name}"
${classes ? `Nice classes of interest: ${classes.join(", ")}` : ""}

Generate search goals for these ${activeRegistries.length} registries:
${activeRegistries.map((r, i) => `${i + 1}. ${r.name} (${r.region}) — ${r.url.replace("BRAND_PLACEHOLDER", encodeURIComponent(brand_name))}`).join("\n")}

For each registry goal:
1. First generate 8-12 phonetic/visual/spelling variants of "${brand_name}"
2. Instruct the TinyFish agent to search the registry for the original name AND each variant
3. For each search result found, extract: mark name, applicant/owner, filing date, registration date, status (live/dead/pending/published for opposition), Nice classes, jurisdiction
4. Return all results as a JSON array

Make each goal extremely specific with step-by-step browser instructions. The agent must search ALL variants, not just the original name.`,
          },
        ],
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return NextResponse.json({ error: `Groq error: ${err}` }, { status: 500 });
    }

    const data    = await groqRes.json();
    const content = data.choices?.[0]?.message?.content;
    const plan    = JSON.parse(content);

    return NextResponse.json(plan);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
