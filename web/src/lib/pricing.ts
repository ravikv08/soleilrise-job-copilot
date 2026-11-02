/**
 * Model choice and the rates used to turn token counts into dollars.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  VERIFY THESE RATES BEFORE YOU PRICE A PLAN ON THEM.
 *
 *  Token counts recorded in ai_usage come straight from the API response and
 *  are exact. The dollar figures below are derived from this table, so they
 *  are only as good as these numbers. Check current pricing at
 *  https://www.anthropic.com/pricing and update RATES — nothing else needs
 *  to change, and past rows can be recomputed from their stored token counts.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const MODELS = {
  /** Resume tailoring and the recruiter review: quality matters most. */
  tailor: "claude-sonnet-5-5",
  /** Parsing a resume into JSON: structure extraction, cheap model is fine. */
  parse: "claude-haiku-5-5",
  /** Scoring many jobs at once: highest volume, so the cheapest capable model. */
  score: "claude-haiku-5-5",
} as const;

export type Operation = "parse_resume" | "tailor" | "score_jobs" | "review" | "screening_answers";

/** USD per million tokens. Placeholder figures — confirm before billing. */
type Rate = { input: number; output: number; cacheWrite: number; cacheRead: number };

const RATES: Record<string, Rate> = {
  "claude-opus-5": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-sonnet-5-5": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-5-5": { input: 0.8, output: 4, cacheWrite: 1.0, cacheRead: 0.08 },
};

const FALLBACK: Rate = RATES["claude-sonnet-5-5"];

export type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
};

/** Dollars for one call, rounded to the micro-dollar ai_usage stores. */
export function costOf(model: string, t: TokenCounts): number {
  const r = RATES[model] ?? FALLBACK;
  const usd =
    (t.inputTokens * r.input +
      t.outputTokens * r.output +
      (t.cacheWriteTokens ?? 0) * r.cacheWrite +
      (t.cacheReadTokens ?? 0) * r.cacheRead) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

/** True when this model has a published rate here rather than falling back. */
export function hasKnownRate(model: string): boolean {
  return model in RATES;
}
