/**
 * Shapes shared by the parser, the tailoring prompt and the UI.
 *
 * These mirror the JSON the artifact already asks Claude for (app/index.html),
 * so a resume parsed by either version stays readable by the other.
 */

export type SkillGroup = { label: string; items: string };

export type ExperienceEntry = {
  company: string;
  title: string;
  dates: string;
  bullets: string[];
};

export type EducationEntry = { text: string; sub?: string[] };

export type MasterResume = {
  name: string;
  contact: string[];
  headline: string;
  summary: string;
  experience: ExperienceEntry[];
  projects: string[];
  skills: SkillGroup[];
  education: EducationEntry[];
};

export type Applicant = {
  workAuth?: string;
  sponsorship?: string;
  location?: string;
  relocate?: string;
  linkedin?: string;
};

export type ScoredRequirement = {
  req: string;
  before: number;
  after: number;
  evidence: string;
};

export type Keyword = {
  term: string;
  variants: string[];
  importance: "required" | "preferred";
};

export type TailoredBullet = { src: string | null; text: string; reason?: string };

export type TailorResult = {
  no_posting?: boolean;
  job: {
    company: string;
    title: string;
    location: string;
    req: string;
    salary: string;
    deadline: string;
    years_required: number | null;
    degree_required: "none" | "bachelor" | "master" | "phd";
  };
  headline: string;
  summary: string;
  skills: SkillGroup[];
  experience: { i: number; bullets: TailoredBullet[] }[];
  projects: TailoredBullet[];
  removed: { src: string; reason: string }[];
  reasons: { headline: string; summary: string; skills: string };
  must: ScoredRequirement[];
  pref: ScoredRequirement[];
  seniority: { before: number; after: number; note: string };
  domain: { before: number; after: number; note: string };
  logistics: { score: number; note: string };
  keywords: Keyword[];
  gaps: string[];
  confirm: string[];
  verdict: string;
};

/** The target score the studio pushes a tailored resume toward. */
export const TARGET = 90;

/**
 * Words the tailoring prompt is forbidden to use. Kept here so the prompt and
 * any client-side warning stay in sync.
 */
export const BANNED = [
  "spearheaded",
  "revolutionized",
  "cutting-edge",
  "leveraged",
  "transformative",
  "synergy",
  "robust",
  "seamless",
  "passionate",
  "dynamic",
  "innovative",
  "state-of-the-art",
  "proven track record",
];

/**
 * A tailoring result is only usable when the model actually scored the
 * posting. Ported from the artifact's validResult().
 */
export function validResult(r: unknown): r is TailorResult {
  if (!r || typeof r !== "object") return false;
  const x = r as Partial<TailorResult>;
  return (
    !x.no_posting &&
    Array.isArray(x.experience) &&
    (x.must?.length ?? 0) > 0 &&
    (x.keywords?.length ?? 0) > 0
  );
}

/**
 * Does this text read like a real job description? Ported from the artifact's
 * jdLooksReal(), which keeps login walls and job *lists* out of the pipeline.
 */
export function jdLooksReal(t: string): boolean {
  const s = String(t ?? "");
  return (
    s.trim().length >= 600 &&
    /(qualification|requirement|responsibilit|years of experience|experience (with|in)|what you('|’)ll do|about the role|you will|minimum|preferred|what we('|’)re looking for)/i.test(
      s,
    ) &&
    !/(join linkedin|sign in to (view|see)|agree & join)/i.test(s.slice(0, 1500))
  );
}

/**
 * Prompt-injection guard for third-party text (job descriptions). Ported
 * verbatim from the artifact's INJECT. A posting that matches is still
 * tailored, but the match is recorded so the UI can warn.
 */
export const INJECT =
  /(ignore (all |any )?(previous|prior|above) (instructions|prompts)|disregard (the |all )?(previous|above|prior)|you are (an? )?(ai|llm|language model|assistant)|as an ai (language )?model|system prompt|^\s*(system|assistant)\s*:|if you are an? (ai|llm|bot|language model)|(rate|score) this (candidate|applicant) (as|at) |include the (word|phrase) .{1,40} in your|hidden instruction)/im;

/**
 * Strip zero-width and bidi characters, which are the usual way hidden text is
 * smuggled into a posting, then collapse whitespace.
 */
export function cleanJD(jd: string): string {
  return String(jd ?? "")
    .replace(/[​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Normalise a posting URL so the same job pasted twice dedupes. */
export function urlKey(u: string): string {
  try {
    const x = new URL(u.trim());
    const keep = ["gh_jid", "jobId", "jid", "id", "job"];
    const q = [...x.searchParams]
      .filter(([k]) => keep.includes(k))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    return (
      x.host.replace(/^www\./, "") +
      x.pathname.replace(/\/+$/, "") +
      (q ? `?${q}` : "")
    ).toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}
