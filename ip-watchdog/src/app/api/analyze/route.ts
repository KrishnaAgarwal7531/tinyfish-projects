import { NextRequest, NextResponse } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

export async function POST(req: NextRequest) {
  try {
    const { brand_name, trademarks, scraped_results } = await req.json();
    if (!brand_name || !scraped_results) {
      return NextResponse.json({ error: "brand_name and scraped_results required" }, { status: 400 });
    }

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are an expert trademark analyst. Given a brand name and raw data scraped from 7 trademark registries worldwide, you analyze every found mark for potential conflicts.

For each potentially conflicting mark found, assess:
1. NAME SIMILARITY (0-100): exact match=100, one letter off=85-95, phonetically similar=70-85, shares prefix/suffix=50-70, vaguely similar=30-50
2. CLASS OVERLAP: do the Nice classes overlap with the brand owner's classes?
3. GEOGRAPHIC RISK: is it in a jurisdiction where the brand operates?
4. STATUS: live/pending marks are dangerous, dead marks are not
5. OPPOSITION DEADLINE: if published for opposition, calculate days remaining

SEVERITY RULES:
- critical: similarity >= 80 AND same classes AND live/pending status
- warning: similarity 60-79 AND overlapping classes 
- info: similarity 40-59 OR different classes OR dead status

Return ONLY valid JSON:
{
  "brand_name": "string",
  "total_marks_found": number,
  "threats": [
    {
      "id": "THR-001 format",
      "severity": "critical | warning | info",
      "conflicting_mark": "string — the mark name",
      "registry": "string — which registry",
      "registry_flag": "string — flag emoji",
      "filed": "YYYY-MM-DD or null",
      "applicant": "string — who filed it",
      "classes": [number array],
      "status": "string — Live, Pending, Published for Opposition, Dead, etc.",
      "similarity": number (0-100),
      "deadline": "YYYY-MM-DD or null",
      "days_left": number or null,
      "description": "string — 2-3 sentence analysis of the risk and recommended action"
    }
  ],
  "summary": "string — 2-3 sentence overall assessment",
  "scan_stats": {
    "registries_searched": number,
    "registries_with_results": number,
    "total_marks_analyzed": number,
    "critical_threats": number,
    "warning_threats": number,
    "info_threats": number
  }
}

Sort threats by severity (critical first) then by similarity score (highest first).
If a registry returned no data or an error, note it but don't generate fake threats.
Only include marks that have similarity >= 40 to the brand name.`,
          },
          {
            role: "user",
            content: `BRAND NAME: "${brand_name}"
${trademarks ? `EXISTING REGISTRATIONS: ${JSON.stringify(trademarks)}` : ""}

SCRAPED RESULTS FROM 7 REGISTRIES:
${JSON.stringify(scraped_results, null, 2)}

Analyze all found marks for potential trademark conflicts with "${brand_name}".`,
          },
        ],
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return NextResponse.json({ error: `Groq error: ${err}` }, { status: 500 });
    }

    const data = await groqRes.json();
    const content = data.choices?.[0]?.message?.content;
    const analysis = JSON.parse(content);

    return NextResponse.json({ analysis });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
