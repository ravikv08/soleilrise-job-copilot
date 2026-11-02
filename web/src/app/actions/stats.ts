"use server";

import { eq } from "drizzle-orm";

import { requireUserId } from "@/auth";
import { db } from "@/db";
import { applications, profiles } from "@/db/schema";
import { analyse } from "@/lib/score";
import { validResult } from "@/lib/resume";

/**
 * The numbers on the profile's stat tiles.
 *
 * "Resumes tailored" counts applications that produced a usable result, and
 * the average score is computed from each stored result rather than cached —
 * so a change to the scoring weights is reflected immediately instead of
 * leaving stale numbers behind.
 */
export async function profileStats() {
  const userId = await requireUserId();

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const rows = await db
    .select({ result: applications.result })
    .from(applications)
    .where(eq(applications.userId, userId));

  const master = profile?.resume ?? null;
  const scored = rows
    .map((r) => (validResult(r.result) ? analyse(master, r.result)?.after.total : null))
    .filter((n): n is number => typeof n === "number");

  return {
    tailored: scored.length,
    avgAfter: scored.length
      ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
      : null,
  };
}
