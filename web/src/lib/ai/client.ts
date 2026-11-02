import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { costOf, type Operation } from "@/lib/pricing";

/**
 * Server-only Claude access.
 *
 * The key never reaches the browser, and every call is written to ai_usage
 * with the exact token counts the API reports. That table is what tells you
 * the real cost of a tailoring before you price a plan on it.
 */

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local.");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

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
};

export function friendly(code: string): string {
  return FRIENDLY[code] ?? FRIENDLY.upstream_error;
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
  throw new AiError("Model did not return JSON", "invalid_json");
}

export type CallOptions = {
  userId: string;
  operation: Operation;
  model: string;
  prompt: string;
  maxTokens?: number;
  applicationId?: string | null;
  /** System prompt. Keep job-posting text out of here — it is untrusted. */
  system?: string;
};

export type CallResult<T> = {
  data: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costUsd: number;
    durationMs: number;
  };
};

/**
 * One metered JSON call. Usage is recorded whether the call succeeds or
 * fails, because a failed call still costs money and still counts against a
 * user's quota.
 */
export async function callJson<T = unknown>(opts: CallOptions): Promise<CallResult<T>> {
  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let ok = "true";

  try {
    const res = await anthropic().messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    });

    inputTokens = res.usage.input_tokens ?? 0;
    outputTokens = res.usage.output_tokens ?? 0;
    cacheReadTokens = res.usage.cache_read_input_tokens ?? 0;
    cacheWriteTokens = res.usage.cache_creation_input_tokens ?? 0;

    if (res.stop_reason === "refusal") throw new AiError("Model refused", "refused");

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const data = extractJson(text) as T;
    const costUsd = costOf(opts.model, {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
    });

    await record(opts, {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      costUsd,
      durationMs: Date.now() - started,
      ok,
    });

    return {
      data,
      usage: {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        costUsd,
        durationMs: Date.now() - started,
      },
    };
  } catch (e) {
    ok = "false";
    await record(opts, {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      costUsd: costOf(opts.model, { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }),
      durationMs: Date.now() - started,
      ok,
    });

    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.APIError) {
      const code =
        e.status === 429
          ? "rate_limited"
          : e.status === 413
            ? "prompt_too_large"
            : "upstream_error";
      throw new AiError(friendly(code), code);
    }
    throw new AiError(friendly("upstream_error"), "upstream_error");
  }
}

async function record(
  opts: CallOptions,
  u: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costUsd: number;
    durationMs: number;
    ok: string;
  },
) {
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
      ok: u.ok,
    });
  } catch {
    // Never let a metering write break the user's request. If this starts
    // failing you lose cost data, so alert on it rather than ignoring it.
  }
}
