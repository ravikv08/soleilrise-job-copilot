"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUserId } from "@/auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { AiError, callJson } from "@/lib/ai/client";
import { parsePrompt } from "@/lib/ai/prompts";
import { EFFORT, MODELS } from "@/lib/pricing";
import type { MasterResume } from "@/lib/resume";

export type ActionState = { ok: boolean; message?: string };

const applicantSchema = z.object({
  workAuth: z.string().max(120).optional(),
  sponsorship: z.string().max(120).optional(),
  location: z.string().max(160).optional(),
  relocate: z.string().max(40).optional(),
  linkedin: z.string().max(300).optional(),
});

async function ensureProfile(userId: string) {
  await db.insert(profiles).values({ userId }).onConflictDoNothing();
}

/** Read the signed-in user's profile, creating an empty one on first visit. */
export async function getProfile() {
  const userId = await requireUserId();
  await ensureProfile(userId);
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return row ?? null;
}

export async function saveApplicant(_prev: ActionState, form: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = applicantSchema.safeParse({
    workAuth: form.get("workAuth") ?? undefined,
    sponsorship: form.get("sponsorship") ?? undefined,
    location: form.get("location") ?? undefined,
    relocate: form.get("relocate") ?? undefined,
    linkedin: form.get("linkedin") ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: "Check those details and try again." };

  await ensureProfile(userId);
  await db
    .update(profiles)
    .set({ applicant: parsed.data, updatedAt: new Date() })
    .where(eq(profiles.userId, userId));
  revalidatePath("/profile");
  return { ok: true, message: "Saved" };
}

export async function saveFacts(_prev: ActionState, form: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const facts = String(form.get("facts") ?? "").slice(0, 20000);
  await ensureProfile(userId);
  await db
    .update(profiles)
    .set({ facts, updatedAt: new Date() })
    .where(eq(profiles.userId, userId));
  revalidatePath("/profile");
  return { ok: true, message: "Saved" };
}

/**
 * Turn pasted resume text into the structured master resume.
 *
 * The parse prompt copies lines verbatim by design — this is the one place
 * the user's own wording enters the system, and nothing downstream is allowed
 * to invent beyond it.
 */
export async function parseResume(_prev: ActionState, form: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const text = String(form.get("resumeText") ?? "").trim();
  if (text.length < 200) {
    return { ok: false, message: "That looks too short to be a resume. Paste the whole thing." };
  }

  await ensureProfile(userId);
  // Save the raw text first: parsing can fail, and losing what someone just
  // pasted is a worse outcome than an unparsed resume.
  await db
    .update(profiles)
    .set({ resumeText: text, updatedAt: new Date() })
    .where(eq(profiles.userId, userId));

  try {
    const { data } = await callJson<MasterResume>({
      userId,
      operation: "parse_resume",
      model: MODELS.parse,
      effort: EFFORT.parse,
      prompt: parsePrompt(text),
      maxTokens: 16000,
    });

    if (!data?.name && !(data?.experience ?? []).length) {
      return { ok: false, message: "Couldn't read that as a resume. Try pasting plain text." };
    }

    await db
      .update(profiles)
      .set({ resume: data, updatedAt: new Date() })
      .where(eq(profiles.userId, userId));
    revalidatePath("/profile");
    return { ok: true, message: `Parsed ${(data.experience ?? []).length} roles` };
  } catch (e) {
    return { ok: false, message: e instanceof AiError ? e.message : "Couldn't parse that resume." };
  }
}
