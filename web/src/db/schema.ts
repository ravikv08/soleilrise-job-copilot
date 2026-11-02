import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

import type { Decisions, Edits } from "@/lib/changes";
import type { Applicant, MasterResume, TailorResult } from "@/lib/resume";

/* ── Auth.js tables ────────────────────────────────────────────────────── */

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ── Profile ───────────────────────────────────────────────────────────── */

/**
 * One row per user. `resume` is the parsed master resume, the only source of
 * truth for tailoring; `facts` holds what the user has separately confirmed
 * is true but is not on the resume. Both are personal data — see the deletion
 * cascade from users.
 */
export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  resume: jsonb("resume").$type<MasterResume | null>(),
  resumeText: text("resume_text"),
  facts: text("facts").notNull().default(""),
  applicant: jsonb("applicant").$type<Applicant>().notNull().default({}),
  targetRoles: jsonb("target_roles").$type<string[]>().notNull().default([]),
  watchCompanies: jsonb("watch_companies").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ── Shared job catalog ────────────────────────────────────────────────── */

/**
 * Filled by the Phase 2 board crawler and shared across all users, so job
 * discovery costs once rather than once per user. In Phase 1 only rows the
 * user pasted or linked land here.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(), // greenhouse | lever | ashby | url | paste
    externalId: text("external_id"),
    url: text("url"),
    urlKey: text("url_key"), // normalised url, for dedupe across sources
    company: text("company").notNull().default(""),
    title: text("title").notNull().default(""),
    location: text("location").notNull().default(""),
    description: text("description").notNull().default(""),
    postedAt: timestamp("posted_at"),
    ingestedAt: timestamp("ingested_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("jobs_source_external_idx").on(t.source, t.externalId),
    index("jobs_url_key_idx").on(t.urlKey),
    index("jobs_posted_at_idx").on(t.postedAt),
  ],
);

/* ── Applications ──────────────────────────────────────────────────────── */

export const PIPELINE = ["draft", "needs_jd", "working", "ready", "blocked", "error"] as const;
export const STATUS = [
  "Draft",
  "Awaiting approval",
  "Approved",
  "Applied",
  "Submission failed",
  "Recruiter replied",
  "Interview",
  "Rejected",
  "Offer",
  "Archived",
] as const;

/**
 * Statuses that mean the application has actually been sent to the employer.
 * Lives here rather than in the actions module: a "use server" file may only
 * export async functions, so a plain constant there fails at runtime.
 */
export const SENT = [
  "Applied",
  "Recruiter replied",
  "Interview",
  "Offer",
  "Rejected",
] as const satisfies readonly (typeof STATUS)[number][];

/**
 * The per-user record of one job: its description, the tailoring result, the
 * edits the user approved, and where it sits in the funnel. This is the
 * artifact's `kind=="job"` document, normalised.
 */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),

    url: text("url"),
    urlKey: text("url_key"),
    company: text("company").notNull().default(""),
    title: text("title").notNull().default(""),
    location: text("location").notNull().default(""),
    jd: text("jd").notNull().default(""),

    pipeline: text("pipeline", { enum: PIPELINE }).notNull().default("draft"),
    status: text("status", { enum: STATUS }).notNull().default("Draft"),
    error: text("error"),

    result: jsonb("result").$type<TailorResult | null>(),
    decisions: jsonb("decisions").$type<Decisions>().notNull().default({}),
    edits: jsonb("edits").$type<Edits>().notNull().default({}),
    verified: jsonb("verified").$type<Record<string, unknown>>().notNull().default({}),
    eligibility: jsonb("eligibility").$type<Record<string, unknown> | null>(),

    approvedAt: timestamp("approved_at"),

    match: integer("match"),
    tailoredAt: date("tailored_at"),
    appliedAt: timestamp("applied_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // One row per user per posting: re-pasting the same URL updates in place.
    uniqueIndex("applications_user_url_idx").on(t.userId, t.urlKey),
    index("applications_user_status_idx").on(t.userId, t.status),
  ],
);

/**
 * One user's score for one shared job.
 *
 * Separate from `jobs` because the catalog is shared and the score is not:
 * the same posting means something different to each resume. Keyed by both,
 * so re-scoring updates in place.
 */
export const jobScores = pgTable(
  "job_scores",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    match: integer("match").notNull(),
    why: text("why").notNull().default(""),
    missing: jsonb("missing").$type<string[]>().notNull().default([]),
    scoredAt: timestamp("scored_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.jobId] }),
    index("job_scores_user_match_idx").on(t.userId, t.match),
  ],
);

/* ── AI usage ──────────────────────────────────────────────────────────── */

/**
 * Every model call, with exact token counts straight from the API response.
 *
 * Token counts are ground truth. `costUsd` is derived from the rate table in
 * lib/pricing.ts and is only as accurate as the rates there — verify them
 * against current Anthropic pricing before you price a plan on this.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    operation: text("operation").notNull(), // parse_resume | tailor | score_jobs | review | ...
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    durationMs: integer("duration_ms"),
    ok: boolean("ok").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_user_created_idx").on(t.userId, t.createdAt),
    index("ai_usage_operation_idx").on(t.operation),
  ],
);
