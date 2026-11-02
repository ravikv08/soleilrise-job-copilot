import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { costOf, type Operation } from "@/lib/pricing";
import { checkQuota } from "@/lib/quota";

/**
 * Server-only Claude access.
 *
 * The key never reaches the browser, every call is checked against the user's
 * quota first, and every call is written to ai_usage with the exact token
 * counts the API reports. That table is what tells you the real cost of a
 * tailoring before you price a plan on it.
 */

let client: Anthropic | null = null;

export class AiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Messages the UI can show as-is. Ported from the artifact's ERR map. */
const FRIENDLY: Record<string, string> = {
  rate_limited: "Too many requests right now. Try again in a minute.",
  invalid_json: "Claude's answer didn't come back in the right format. Try again.",
  prompt_too_large: "That posting is too long. Trim the pasted text to the job description.",
  refused: "Claude declined this request. Check the pasted text.",
  upstream_error: "Connection problem. Try again.",
  no_key: "The server has no Anthropic API key configured.",
  bad_request: "Claude rejected that request. If this keeps happening, report it.",
  quota: "You've used your AI allowance for now.",
};

export function friendly(code: string): string {
  return FRIENDLY[code] ?? FRIENDLY.upstream_error;
}

function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    // Distinct from a network failure, and the operator needs to know which.
    if (!apiKey) throw new AiError(friendly("no_key"), "no_key");
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Pull a JSON value out of a model reply that may be wrapped in prose or a
 * fenced block. Falls back to the outermost {...} or [...] span.
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], trimmed].filter(Boolean) as string[];

  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // fall through to span scanning
    }
  }

  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"],
  ] as const) {
    const start = trimmed.indexOf(open);
    const end = trimmed.lastIndexOf(close);
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // keep trying
      }
    }
  }
  throw new AiError(friendly("invalid_json"), "invalid_json");
}

export type CallOptions = {
  userId: string;
  operation: Operation;
  model: string;
  prompt: string;
  /** low | medium | high | xhigh | max. Opus 5.5 defaults to medium. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  applicationId?: string | null;
};

export type CallUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  durationMs: number;
};

export type CallResult<T> = { data: T; usage: CallUsage };

/**
 * One metered JSON call.
 *
 * Streamed because tailoring sends a whole resume plus a 30k-character
 * posting and can run a minute — a non-streaming request that long risks an
 * HTTP timeout. Usage is recorded whether the call succeeds or fails: a
 * failed call still costs money and still counts against the quota.
 */
export async function callJson<T = unknown>(opts: CallOptions): Promise<CallResult<T>> {
  const verdict = await checkQuota(opts.userId);
  if (!verdict.allowed) throw new AiError(verdict.reason, "quota");

  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;

  const finish = (ok: boolean): CallUsage => {
    const usage = {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      costUsd: costOf(opts.model, {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
      }),
      durationMs: Date.now() - started,
    };
    void record(opts, usage, ok);
    return usage;
  };

  try {
    const stream = anthropic().beta.messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 16000,
      // Thinking is always on for Opus 5.5 and cannot be disabled; effort is
      // the control, and its default is medium, so it is always set here.
      output_config: { effort: opts.effort ?? "medium" },
      // A policy decline otherwise just stops the request. This re-runs it on
      // a fallback model inside the same call, routed by refusal category.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: opts.prompt }],
    });

    const res = await stream.finalMessage();

    inputTokens = res.usage.input_tokens ?? 0;
    outputTokens = res.usage.output_tokens ?? 0;
    cacheReadTokens = res.usage.cache_read_input_tokens ?? 0;
    cacheWriteTokens = res.usage.cache_creation_input_tokens ?? 0;

    // Check before reading content: a refusal returns 200 with no usable body.
    if (res.stop_reason === "refusal") {
      finish(false);
      throw new AiError(friendly("refused"), "refused");
    }
    if (res.stop_reason === "max_tokens") {
      finish(false);
      throw new AiError(
        "Claude's answer was cut off before it finished. Try a shorter posting.",
        "invalid_json",
      );
    }

    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const data = extractJson(text) as T;
    return { data, usage: finish(true) };
  } catch (e) {
    if (e instanceof AiError) {
      // stop_reason paths already recorded; everything else records here.
      if (e.code !== "refused" && e.code !== "invalid_json") finish(false);
      else if (e.code === "invalid_json" && outputTokens === 0) finish(false);
      throw e;
    }
    finish(false);

    // Most specific first: a 400 is a bug in our request, a 429 is transient,
    // and a connection error is neither.
    if (e instanceof Anthropic.AuthenticationError) throw new AiError(friendly("no_key"), "no_key");
    if (e instanceof Anthropic.RateLimitError)
      throw new AiError(friendly("rate_limited"), "rate_limited");
    if (e instanceof Anthropic.BadRequestError) {
      const tooLong = /max_tokens|too long|exceeds/i.test(e.message);
      const code = tooLong ? "prompt_too_large" : "bad_request";
      throw new AiError(friendly(code), code);
    }
    if (e instanceof Anthropic.APIConnectionError)
      throw new AiError(friendly("upstream_error"), "upstream_error");
    if (e instanceof Anthropic.APIError)
      throw new AiError(friendly("upstream_error"), "upstream_error");
    throw new AiError(friendly("upstream_error"), "upstream_error");
  }
}

async function record(opts: CallOptions, u: CallUsage, ok: boolean) {
  try {
    await db.insert(aiUsage).values({
      userId: opts.userId,
      applicationId: opts.applicationId ?? null,
      operation: opts.operation,
      model: opts.model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cacheReadTokens: u.cacheReadTokens,
      cacheWriteTokens: u.cacheWriteTokens,
      costUsd: u.costUsd.toFixed(6),
      durationMs: u.durationMs,
      ok,
    });
  } catch (e) {
    // Never fail the user's request over metering, but never lose it quietly
    // either: this table is both the cost record and the quota's input, so a
    // silent failure means unmetered spend. Alert on this line.
    console.error("[ai_usage] failed to record a model call", {
      userId: opts.userId,
      operation: opts.operation,
      model: opts.model,
      costUsd: u.costUsd,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
