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

  const prompt = `Write a LinkedIn message to ${KIND[group] ?? "a professional contact"}.
Recipient works at ${app.company}. Role being discussed: "${app.title}".
Under 90 words. LinkedIn connection-request notes must fit 300 characters, so write a version under 280 characters FIRST, then a blank line, then the longer message.
Plain, specific, human: name the 2 strongest overlaps between the candidate and the role, one concrete result from the resume, and one clear ask. No flattery, no buzzwords (${BANNED.join(", ")}), no emojis. Never claim experience the resume does not show. Do not invent the recipient's name — write it so the candidate fills the name in.
CANDIDATE: ${sent.headline} — ${sent.summary}
CANDIDATE EVIDENCE: ${(sent.experience ?? []).flatMap((e) => (e.bullets ?? []).slice(0, 3)).slice(0, 10).join(" | ")}
POSTING EXCERPT: ${cleanJD(app.jd).slice(0, 2500)}
Reply with only JSON: {"short":"the under-280-character version","long":"the longer message"}`;

  try {
    const { data } = await callJson<{ short?: string; long?: string }>({
      userId,
      applicationId: id,
      operation: "screening_answers",
      model: MODELS.tailor,
      effort: EFFORT.score,
      maxTokens: 2000,
      prompt,
    });

    const text = [data?.short, data?.long].filter(Boolean).join("\n\n").trim();
    if (!text) return { ok: false, message: "Came back empty. Try again." };

    await db
      .update(applications)
      .set({
        outreach: { ...(app.outreach ?? {}), [group]: text },
        updatedAt: new Date(),
      })
      .where(eq(applications.id, id));

    revalidatePath(`/studio/${id}`);
    return { ok: true, message: "Drafted" };
  } catch (e) {
    return { ok: false, message: e instanceof AiError ? e.message : "Could not draft that." };
  }
}
