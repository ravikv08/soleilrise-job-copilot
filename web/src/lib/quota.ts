import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { aiUsage } from "@/db/schema";

/**
 * Spend limits.
 *
 * Without these anyone with an account can run the owner's Anthropic key to
 * any amount. Both ceilings are deliberately low: raise them once ai_usage
 * shows what a real month of use costs.
 */
export const LIMITS = {
  /** Dollars per user per rolling 30 days. */
  monthlyUsd: Number(process.env.QUOTA_MONTHLY_USD ?? 5),
  /** Calls per user per rolling hour, to blunt a tight retry loop. */
  hourlyCalls: Number(process.env.QUOTA_HOURLY_CALLS ?? 30),
} as const;

export type QuotaVerdict =
  | { allowed: true; spentUsd: number; remainingUsd: number }
  | { allowed: false; reason: string };

/**
 * Checked before every model call. Counts failed calls too — they are billed
 * and they are the ones a retry loop produces.
 */
export async function checkQuota(userId: string): Promise<QuotaVerdict> {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [[month], [hour]] = await Promise.all([
    db
      .select({ spent: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, monthAgo))),
    db
      .select({ calls: sql<string>`count(*)` })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, hourAgo))),
  ]);

  const spentUsd = Number(month?.spent ?? 0);
  const calls = Number(hour?.calls ?? 0);

  if (calls >= LIMITS.hourlyCalls) {
    return {
      allowed: false,
      reason: `You've hit this hour's limit of ${LIMITS.hourlyCalls} AI requests. Try again shortly.`,
    };
  }
  if (spentUsd >= LIMITS.monthlyUsd) {
    return {
      allowed: false,
      reason: "You've used this month's AI allowance. It resets 30 days after each request.",
    };
  }

  return { allowed: true, spentUsd, remainingUsd: LIMITS.monthlyUsd - spentUsd };
}

/** Spend summary for the current rolling month, for display. */
export async function usageSummary(userId: string) {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      spent: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`,
      calls: sql<string>`count(*)`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, monthAgo)));

  return {
    spentUsd: Number(row?.spent ?? 0),
    calls: Number(row?.calls ?? 0),
    limitUsd: LIMITS.monthlyUsd,
  };
}
