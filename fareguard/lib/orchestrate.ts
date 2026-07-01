import { store } from "./store";
import { generateSeedData } from "./seed";
import { SITES, ROUTES } from "./seed";
import { runAgentSweep } from "./agents";
import { checkBookingThresholds } from "./booking";
import { buildRecommendations } from "./analyze";

// Guarantees every (site, route) combination has at least seed data, so the
// dashboard never shows a blank/flat chart — even if a previous sweep only
// partially completed (some sites real, some failed, some never run yet).
// Existing real or simulated data is always preserved; only missing keys
// get backfilled from synthetic seed data.
export async function ensureSeeded() {
  const existing = await store.getPriceSeries();
  const expectedKeys = SITES.length * ROUTES.length;
  const existingKeys = Object.keys(existing);
  if (existingKeys.length >= expectedKeys && existingKeys.every((k) => existing[k]?.history?.length > 0)) {
    return existing;
  }

  const seed = generateSeedData();
  const merged = { ...seed.priceSeries, ...existing }; // existing data wins over seed on key collisions
  await store.setPriceSeries(merged);

  const existingStatuses = await store.getAgentStatuses();
  if (Object.keys(existingStatuses).length === 0) {
    await store.setAgentStatuses(seed.agentStatuses);
  }
  return merged;
}

function isDue(lastAt: string | null, intervalMs: number): boolean {
  if (!lastAt) return true;
  return Date.now() - new Date(lastAt).getTime() >= intervalMs;
}

// The one function that does the real work: sweep all 7 sites, save prices,
// check booking thresholds, and — only if the daily analysis is actually
// due — run Groq immediately afterward. Called by exactly 3 places:
//   - scripts/sweep.ts (the GitHub Actions cron job, in production)
//   - the POST handler in local dev (the "Run sweep now" button)
//   - bootstrapLocalDevIfNeeded (local dev, first-ever run only)
// `reason` is logged so the terminal always shows exactly which of these
// three triggered a given sweep — no more guessing.
export async function runSweepAndMaybeAnalyze(reason: string) {
  console.log(`[sweep] starting — reason: ${reason}`);
  // Mark as started immediately, in durable storage, before any slow work
  // begins. This closes a real race: previously "has a sweep started" was
  // only knowable once it finished (lastSweepAt) or via an in-memory flag
  // that Next.js's dev server can reset when it compiles a new route for
  // the first time — which could let a second sweep sneak in while the
  // first was still running.
  await store.setMeta({ sweepStartedAt: new Date().toISOString() });

  const current = await ensureSeeded();
  const { priceSeries, agentStatuses } = await runAgentSweep(current);
  await store.setPriceSeries(priceSeries);
  await store.setAgentStatuses(agentStatuses);

  const triggeredCount = await checkBookingThresholds(priceSeries);

  await store.setMeta({
    lastSweepAt: new Date().toISOString(),
    usingRealAgents: Boolean(process.env.TINYFISH_API_KEY),
  });

  const meta = await store.getMeta();
  let analyzed = false;
  if (isDue(meta.lastAnalyzeAt, meta.analyzeIntervalMs)) {
    const recommendations = await buildRecommendations(priceSeries);
    await store.setRecommendations(recommendations);
    await store.setMeta({ lastAnalyzeAt: new Date().toISOString() });
    analyzed = true;
  }

  return { sitesSwept: Object.keys(agentStatuses).length, triggeredCount, analyzed };
}

// Local-dev-only convenience: if a real TinyFish key is set and a sweep has
// NEVER been started (not just never completed — see sweepStartedAt above),
// kick off one real sweep in the background — WITHOUT blocking the
// response. The dashboard shows realistic seed data immediately, and picks
// up real data once the background sweep finishes (the frontend polls for
// this). Runs exactly once — after that, even local loads just read
// whatever's in the store, same as production. Never runs on Vercel
// (process.env.VERCEL is set there) — sweeps in production only ever
// happen via the GitHub Actions schedule or an explicit "Run sweep now"
// dispatch, never just because someone opened the page.
let bootstrapChecked = false;
export function bootstrapLocalDevIfNeeded() {
  if (process.env.VERCEL) return;
  if (!process.env.TINYFISH_API_KEY) return;
  if (bootstrapChecked) return; // fast path within a single module instance
  bootstrapChecked = true;

  store.getMeta().then((meta) => {
    if (meta.sweepStartedAt !== null) return; // durable — survives dev-server module resets
    console.log("[bootstrap] first run detected, starting real sweep in the background...");
    runSweepAndMaybeAnalyze("local-dev-bootstrap (first ever run)")
      .then(() => console.log("[bootstrap] background sweep complete"))
      .catch((err) => console.error("[bootstrap] background sweep failed:", err));
  });
}
