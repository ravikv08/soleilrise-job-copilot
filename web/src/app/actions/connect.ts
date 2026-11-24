"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUserId } from "@/auth";
import { db } from "@/db";
import { applications, profiles } from "@/db/schema";
import { AiError, callJson } from "@/lib/ai/client";
import { EFFORT, MODELS } from "@/lib/pricing";
import { BANNED, cleanJD, validResult } from "@/lib/resume";
import { finalResume } from "@/lib/changes";
import type { NetworkRead } from "@/lib/linkedin";

import type { ActionState } from "./profile";

/** One set of drafts: the three LinkedIn surfaces plus the nudge. */
export type Outreach = {
  note?: string;
  inmailSubject?: string;
  inmail?: string;
  followUp?: string;
};

/**
 * Read the posting for who is likely involved in hiring.
 *
 * The prompt forbids guessing names: a name is only returned when the posting
 * itself prints one. Everything else is titles and team names, which is what
 * a LinkedIn search needs — and inventing a hiring manager would send someone
 * to message a stranger with a fabricated reason.
 */
export async function readHiringTeam(id: string): Promise<ActionState> {
  const userId = await requireUserId();

  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .limit(1);
  if (!app) return { ok: false, message: "Posting not found." };
  if (cleanJD(app.jd).length < 300) {
    return { ok: false, message: "Not enough of the posting to read the team from." };
  }

  const prompt = `From this job posting, infer who is most likely involved in hiring, so the candidate can search LinkedIn for the right people. Do NOT guess or invent names. Only if the posting text explicitly names a recruiter or hiring manager (e.g. "Recruiter: Jane Doe"), list them in named_in_posting; otherwise return an empty list.
Reply with only JSON: {"department":"team or org name exactly as the posting describes it","team_keywords":["2-4 exact team, product or org names from the posting that people on this team put in their LinkedIn headline. Use names the posting actually says; no generic words like 'engineering'"],"function_keywords":["2-3 words for the discipline, e.g. 'machine learning', 'data platform'"],"manager_titles":["2-4 titles the hiring manager for THIS level likely holds"],"peer_titles":["2-3 titles of peers on the team"],"recruiter_focus":"e.g. 'AI/ML and technology recruiting'","recruiter_keywords":["2-3 words recruiters for this team list in their headline"],"why":"one sentence on who to contact first and why","named_in_posting":[{"name":"","role":""}]}
COMPANY: ${app.company}
TITLE: ${app.title}
POSTING: ${cleanJD(app.jd).slice(0, 7000)}`;

  try {
    const { data } = await callJson<NetworkRead>({
      userId,
      applicationId: id,
      operation: "screening_answers",
      model: MODELS.score,
      effort: EFFORT.score,
      maxTokens: 4000,
      prompt,
    });

    await db
      .update(applications)
      .set({ network: data, updatedAt: new Date() })
      .where(eq(applications.id, id));

    revalidatePath(`/studio/${id}`);
    return { ok: true, message: "Read the posting for the team" };
  } catch (e) {
    return { ok: false, message: e instanceof AiError ? e.message : "Could not read the posting." };
  }
}

const KIND: Record<string, string> = {
  hm: "a hiring manager (ask for a short conversation about the role)",
  recruiter: "a recruiter (introduce yourself and say you applied or are applying)",
  connection: "an existing connection or employee (warm, ask for an intro or referral)",
};

/**
 * Draft an outreach message for one of the three search groups.
 *
 * Grounded in the tailored resume the user approved, so the message cannot
 * claim something the resume does not support — the same rule the resume
 * itself is held to.
 */
export async function draftOutreach(id: string, group: string): Promise<ActionState> {
  const userId = await requireUserId();

  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .limit(1);
  if (!app) return { ok: false, message: "Posting not found." };

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!profile?.resume) return { ok: false, message: "Add your master resume first." };

  // Prefer the tailored version when it exists: it is what they actually sent.
  const sent = validResult(app.result)
    ? finalResume(profile.resume, app.result, app.decisions, app.edits)
    : profile.resume;

  const prompt = `Write LinkedIn outreach to ${KIND[group] ?? "a professional contact"}.
Recipient works at ${app.company}. Role being discussed: "${app.title}".

Produce three things, each for a different LinkedIn surface:
1. "note" — a connection-request note. HARD LIMIT 280 characters including spaces. One specific overlap and one ask. This is the only one most people will read.
2. "inmailSubject" — an InMail subject line, under 60 characters, concrete and not salesy. No "Quick question" or "Opportunity".
3. "inmail" — the InMail body, 120-160 words. Room for two overlaps, one concrete result with its number, and a specific ask. InMail is a paid credit, so it must earn the reply.
4. "followUp" — a 50-word nudge to send 5-7 days later if there is no reply. It must add something new, not repeat the first message.

Rules for all of them. Plain, specific, human. Name only overlaps the candidate's evidence actually supports. Keep every number exactly as the evidence has it. No flattery, no buzzwords (${BANNED.join(", ")}), no emojis, no "I hope this finds you well". Never claim experience the resume does not show. Do not invent the recipient's name — write "[Name]" for the candidate to fill in.

CANDIDATE: ${sent.headline} — ${sent.summary}
CANDIDATE EVIDENCE: ${(sent.experience ?? []).flatMap((e) => (e.bullets ?? []).slice(0, 3)).slice(0, 10).join(" | ")}
POSTING EXCERPT: ${cleanJD(app.jd).slice(0, 2500)}
Reply with only JSON: {"note":"","inmailSubject":"","inmail":"","followUp":""}`;

  try {
    const { data } = await callJson<Outreach>({
      userId,
      applicationId: id,
      operation: "screening_answers",
      model: MODELS.tailor,
      effort: EFFORT.score,
      // Four drafts plus adaptive thinking; 2000 truncated mid-JSON.
      maxTokens: 8000,
      prompt,
    });

    if (!data?.note && !data?.inmail) return { ok: false, message: "Came back empty. Try again." };

    // LinkedIn silently truncates a connection note past 300 characters, so a
    // draft that overruns is worse than useless — flag it rather than ship it.
    const over = (data.note ?? "").length > 300;

    await db
      .update(applications)
      .set({
        outreach: { ...(app.outreach ?? {}), [group]: data },
        updatedAt: new Date(),
      })
      .where(eq(applications.id, id));

    revalidatePath(`/studio/${id}`);
    return {
      ok: true,
      message: over
        ? `Drafted, but the connection note came out at ${(data.note ?? "").length} characters — trim it under 300 before sending.`
        : "Drafted",
    };
  } catch (e) {
    return { ok: false, message: e instanceof AiError ? e.message : "Could not draft that." };
  }
}
