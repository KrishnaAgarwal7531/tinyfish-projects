import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { ensureSeeded } from "@/lib/orchestrate";
import { buildRecommendations } from "@/lib/analyze";
import { isAuthorized } from "@/lib/auth";

export const maxDuration = 60;

// GET: read the latest saved recommendations — read-only, no side effects.
export async function GET() {
  const recommendations = await store.getRecommendations();
  const meta = await store.getMeta();
  return NextResponse.json({ recommendations, meta });
}

// POST: force-recompute recommendations from the full accumulated price
// history right now. This one stays fast regardless of plan — it's a
// single Groq call, not a multi-site browser sweep — so it's fine to run
// inline on Vercel Cron directly (once a day).
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const priceSeries = await ensureSeeded();
  const recommendations = await buildRecommendations(priceSeries);
  await store.setRecommendations(recommendations);
  await store.setMeta({ lastAnalyzeAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, recommendations });
}
