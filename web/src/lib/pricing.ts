/**
 * Model choice and the rates used to turn token counts into dollars.
 *
 * Rates below are Anthropic first-party API list prices per million tokens.
 * Token counts recorded in ai_usage come straight from the API response and
 * are exact; the dollar figures are derived from this table. Re-check against
 * https://www.anthropic.com/pricing when you set a price — past rows can be
 * recomputed from their stored token counts without a backfill.
 */

/**
 * Every operation runs on Opus 5.5, the current default model.
 *
 * Cheaper models exist and this is the single place to choose one:
 * claude-sonnet-5-5 is $2/$10 per MTok and claude-haiku-5-5 is $0.10/$0.50,
 * against Opus 5.5 at $4/$20. Parsing and bulk scoring are the obvious
 * candidates to move down once ai_usage shows what they actually cost — but
 * that is a quality trade, so it is a decision to make on measured data
 * rather than a default to inherit.
 */
export const MODELS = {
  /** Resume tailoring and the recruiter review: quality matters most. */
  tailor: "claude-opus-5-5",
  /** Parsing a resume into JSON: mechanical structure extraction. */
  parse: "claude-opus-5-5",
  /** Scoring many jobs at once: the highest-volume call. */
  score: "claude-opus-5-5",
} as const;

/**
 * Reasoning depth per operation. Opus 5.5 defaults to "medium", so each call
 * sets this explicitly rather than inheriting a default that may change.
 */
export const EFFORT = {
  tailor: "high",
  parse: "low",
  score: "medium",
} as const;

export type Operation = "parse_resume" | "tailor" | "score_jobs" | "review" | "screening_answers";

/** USD per million tokens. */
type Rate = { input: number; output: number; cacheWrite: number; cacheRead: number };

const RATES: Record<string, Rate> = {
  // Cache writes are ~1.25x input; cache reads are published per model.
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  // Haiku 5.5 input/output rise to $0.50/$2.50 beyond a 100K-token prompt;
  // this uses the under-100K rate, so long prompts are under-reported.
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
};

const FALLBACK: Rate = RATES["claude-opus-5-5"];

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
