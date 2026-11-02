"use server";

import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUserId } from "@/auth";
import { db } from "@/db";
import { applications, jobs, jobScores, profiles } from "@/db/schema";
import { AiError, callJson } from "@/lib/ai/client";
import { candidateWhere } from "@/lib/ai/prompts";
import { BOARDS } from "@/lib/boards-data";
import { crawlBoards, inUS, usable } from "@/lib/crawl";
import { EFFORT, MODELS } from "@/lib/pricing";
import { urlKey } from "@/lib/resume";

import type { ActionState } from "./profile";

/** How old a posting may be and still be worth surfacing. */
const MAX_AGE_DAYS = 21;

export type CrawlSummary = ActionState & {
  boards?: number;
  failed?: number;
  seen?: number;
  inserted?: number;
};

/**
 * Crawl the board list into the shared `jobs` table.
 *
 * Not per user: whoever triggers it, every user reads the same rows
 * afterwards. In production this belongs on a schedule rather than a button.
 */
export async function runCrawl(limitBoards?: number): Promise<CrawlSummary> {
  await requireUserId();

  const boards = limitBoards ? BOARDS.slice(0, limitBoards) : BOARDS;
  const results = await crawlBoards(boards);

  const failed = results.filter((r) => !r.ok);
  const found = results.flatMap((r) => (r.ok ? r.jobs : []));
  const keep = found.filter((j) => usable(j, MAX_AGE_DAYS) && inUS(j.location));

  let inserted = 0;
  // Chunked: a single insert of several thousand rows exceeds the parameter
  // limit the driver will bind.
  for (let i = 0; i < keep.length; i += 200) {
    const chunk = keep.slice(i, i + 200);
    const rows = await db
      .insert(jobs)
      .values(
        chunk.map((j) => ({
          source: j.source,
          externalId: j.externalId,
          url: j.url,
          urlKey: urlKey(j.url),
          company: j.company,
          title: j.title,
          location: j.location,
          description: j.description,
          postedAt: j.postedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [jobs.source, jobs.externalId],
        set: {
          title: sql`excluded.title`,
          location: sql`excluded.location`,
          description: sql`excluded.description`,
          url: sql`excluded.url`,
          ingestedAt: new Date(),
        },
      })
      .returning({ id: jobs.id });
    inserted += rows.length;
  }

  revalidatePath("/find");
  return {
    ok: true,
    message: `Read ${results.length - failed.length} of ${results.length} boards, kept ${keep.length} US postings`,
    boards: results.length,
    failed: failed.length,
    seen: found.length,
    inserted,
  };
}

/** Jobs this user has not scored yet, newest first. */
async function unscored(userId: string, limit: number) {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000);
  return db
    .select({
      id: jobs.id,
      company: jobs.company,
      title: jobs.title,
      location: jobs.location,
      description: jobs.description,
    })
    .from(jobs)
    .leftJoin(
      jobScores,
      and(eq(jobScores.jobId, jobs.id), eq(jobScores.userId, userId)),
    )
    .where(and(isNull(jobScores.jobId), gte(jobs.postedAt, cutoff)))
    .orderBy(desc(jobs.postedAt))
    .limit(limit);
}

type Scored = { id: string; match: number; why: string; missing: string[] };

/**
 * Score a batch of jobs against the user's resume in one call.
 *
 * Batched deliberately: the resume is the expensive part of the prompt, and
 * sending it once for twenty jobs rather than twenty times is most of the
 * difference between discovery being affordable and not.
 */
export async function scoreJobs(count = 20): Promise<ActionState> {
  const userId = await requireUserId();

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!profile?.resume) {
    return { ok: false, message: "Add your master resume on the Profile page first." };
  }

  const batch = await unscored(userId, count);
  if (!batch.length) return { ok: true, message: "Everything is scored." };

  const m = profile.resume;
  const digest = {
    headline: m.headline,
    summary: m.summary,
    roles: (m.experience ?? []).map((e) => ({
      company: e.company,
      title: e.title,
      dates: e.dates,
      bullets: (e.bullets ?? []).slice(0, 6),
    })),
    skills: m.skills,
    education: (m.education ?? []).map((e) => e.text),
    confirmed_facts: profile.facts || "",
  };

  const docs = batch.map((j) => ({
    id: j.id,
    company: j.company,
    title: j.title,
    location: j.location,
    // Trimmed hard: twenty full descriptions would dominate the prompt, and
    // the opening of a posting carries the requirements.
    description: j.description.slice(0, 2600),
  }));

  // Prompt ported from the artifact's rankTop().
  const prompt = `Score how well this candidate matches each job, 0-100, using this rubric: required qualifications 40, preferred qualifications 15, key skills and keywords 15, seniority and scope 15, domain 10, location fit 5 (${candidateWhere(profile.applicant ?? {}, m)}). Judge only from the real resume; never assume skills it doesn't show. A job with an empty description gets your best estimate from its title, and say so in why.
Reply with only a JSON array, one object per job: [{"id":"", "match":0, "why":"one short sentence on the strongest overlap", "missing":["up to 3 missing qualifications"]}]

CANDIDATE
${JSON.stringify(digest)}

JOBS
${JSON.stringify(docs)}`;

  try {
    const { data } = await callJson<Scored[]>({
      userId,
      operation: "score_jobs",
      model: MODELS.score,
      effort: EFFORT.score,
      maxTokens: 16000,
      prompt,
    });

    const byId = new Map(batch.map((j) => [j.id, j]));
    const rows = (Array.isArray(data) ? data : [])
      .filter((o) => o && byId.has(String(o.id)))
      .map((o) => ({
        userId,
        jobId: String(o.id),
        match: Math.max(0, Math.min(100, Math.round(Number(o.match) || 0))),
        why: String(o.why ?? "").slice(0, 240),
        missing: (o.missing ?? []).slice(0, 3).map(String),
      }));

    if (rows.length) {
      await db
        .insert(jobScores)
        .values(rows)
        .onConflictDoUpdate({
          target: [jobScores.userId, jobScores.jobId],
          set: {
            match: sql`excluded.match`,
            why: sql`excluded.why`,
            missing: sql`excluded.missing`,
            scoredAt: new Date(),
          },
        });
    }

    revalidatePath("/find");
    return { ok: true, message: `Scored ${rows.length} job${rows.length === 1 ? "" : "s"}` };
  } catch (e) {
    return { ok: false, message: e instanceof AiError ? e.message : "Scoring failed." };
  }
}

/** Scored jobs for the find page, filtered and ranked. */
export async function listDiscovered(minMatch: number, sector: string | null) {
  const userId = await requireUserId();
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000);

  const rows = await db
    .select({
      id: jobs.id,
      company: jobs.company,
      title: jobs.title,
      location: jobs.location,
      url: jobs.url,
      urlKey: jobs.urlKey,
      source: jobs.source,
      postedAt: jobs.postedAt,
      match: jobScores.match,
      why: jobScores.why,
      missing: jobScores.missing,
    })
    .from(jobScores)
    .innerJoin(jobs, eq(jobs.id, jobScores.jobId))
    .where(
      and(
        eq(jobScores.userId, userId),
        gte(jobScores.match, minMatch),
        gte(jobs.postedAt, cutoff),
      ),
    )
    .orderBy(desc(jobScores.match))
    .limit(100);

  const filtered = sector ? rows.filter((r) => r.source === sector) : rows;

  // Mark the ones already in the studio so they are not offered twice.
  const keys = filtered.map((r) => r.urlKey).filter((k): k is string => !!k);
  const existing = keys.length
    ? await db
        .select({ urlKey: applications.urlKey })
        .from(applications)
        .where(and(eq(applications.userId, userId), inArray(applications.urlKey, keys)))
    : [];
  const taken = new Set(existing.map((e) => e.urlKey));

  return filtered.map((r) => ({ ...r, inStudio: taken.has(r.urlKey) }));
}

/** Counts for the find page header. */
export async function discoverStats() {
  const userId = await requireUserId();
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000);
  const [[total], [scored]] = await Promise.all([
    db
      .select({ n: sql<string>`count(*)` })
      .from(jobs)
      .where(gte(jobs.postedAt, cutoff)),
    db
      .select({ n: sql<string>`count(*)` })
      .from(jobScores)
      .where(eq(jobScores.userId, userId)),
  ]);
  return { total: Number(total?.n ?? 0), scored: Number(scored?.n ?? 0) };
}

/** Move a discovered job into the studio as an application. */
export async function addToStudio(jobId: string): Promise<ActionState> {
  const userId = await requireUserId();
  const [j] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!j) return { ok: false, message: "Job not found." };

  await db
    .insert(applications)
    .values({
      userId,
      jobId: j.id,
      url: j.url,
      urlKey: j.urlKey ?? urlKey(j.url ?? ""),
      company: j.company,
      title: j.title,
      location: j.location,
      jd: j.description,
      pipeline: "ready",
    })
    .onConflictDoNothing();

  revalidatePath("/find");
  revalidatePath("/studio");
  return { ok: true, message: "Added to Resume Studio" };
}
