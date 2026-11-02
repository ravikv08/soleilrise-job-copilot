"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/SubmitButton";
import type { ActionState } from "@/app/actions/profile";
import type { Applicant, MasterResume } from "@/lib/resume";

const EMPTY: ActionState = { ok: true };

function Status({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return <div className={`notice ${state.ok ? "ok" : "err"}`}>{state.message}</div>;
}

export function ResumeForm({
  action,
  resume,
  resumeText,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  resume: MasterResume | null;
  resumeText: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY);

  return (
    <form action={formAction} className="grid gap-3">
      <h2 className="text-xl">Your master resume</h2>
      <p style={{ color: "var(--muted)" }}>
        Paste the resume you keep as your master copy. Every tailored version starts from this,
        word for word — nothing is added that it does not already support.
      </p>

      {resume ? (
        <div className="notice ok">
          Parsed: {resume.name || "unnamed"} · {(resume.experience ?? []).length} roles ·{" "}
          {(resume.skills ?? []).length} skill groups
        </div>
      ) : null}

      <textarea
        name="resumeText"
        className="field"
        rows={10}
        defaultValue={resumeText}
        placeholder="Paste your resume text here"
      />
      <Status state={state} />
      <div>
        <SubmitButton pendingLabel="Reading your resume…">Save and parse</SubmitButton>
      </div>
    </form>
  );
}

export function FactsForm({
  action,
  facts,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  facts: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY);

  return (
    <form action={formAction} className="grid gap-3">
      <h2 className="text-xl">Confirmed facts</h2>
      <p style={{ color: "var(--muted)" }}>
        True things about your experience that are not on the resume. These are the only facts
        outside your resume that tailoring may draw on, so keep them accurate.
      </p>
      <textarea
        name="facts"
        className="field"
        rows={5}
        defaultValue={facts}
        placeholder="e.g. Led the Kafka migration at Acme, not written up on the resume"
      />
      <Status state={state} />
      <div>
        <SubmitButton>Save facts</SubmitButton>
      </div>
    </form>
  );
}

export function ApplicantForm({
  action,
  applicant,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  applicant: Applicant;
}) {
  const [state, formAction] = useActionState(action, EMPTY);

  return (
    <form action={formAction} className="grid gap-3">
      <h2 className="text-xl">Work authorization &amp; location</h2>
      <p style={{ color: "var(--muted)" }}>
        Used to flag postings that need citizenship or a clearance you do not have, and to score
        location fit. Never guessed.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">
          Work authorization
          <select name="workAuth" className="field" defaultValue={applicant.workAuth ?? ""}>
            <option value="">Select…</option>
            <option value="US citizen">US citizen</option>
            <option value="Green card holder">Green card holder</option>
            <option value="H-1B">H-1B</option>
            <option value="F-1 OPT">F-1 OPT</option>
            <option value="Other">Other</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm font-semibold">
          Need sponsorship?
          <select name="sponsorship" className="field" defaultValue={applicant.sponsorship ?? ""}>
            <option value="">Select…</option>
            <option value="No">No</option>
            <option value="Yes">Yes</option>
            <option value="Later">Not now, later</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm font-semibold">
          Location
          <input
            name="location"
            className="field"
            defaultValue={applicant.location ?? ""}
            placeholder="San Jose, CA"
          />
        </label>

        <label className="grid gap-1 text-sm font-semibold">
          Open to relocating?
          <select name="relocate" className="field" defaultValue={applicant.relocate ?? ""}>
            <option value="">Select…</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
          LinkedIn
          <input
            name="linkedin"
            className="field"
            defaultValue={applicant.linkedin ?? ""}
            placeholder="https://www.linkedin.com/in/…"
          />
        </label>
      </div>

      <Status state={state} />
      <div>
        <SubmitButton>Save details</SubmitButton>
      </div>
    </form>
  );
}

export function TargetRolesForm({
  action,
  roles,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  roles: string[];
}) {
  const [state, formAction] = useActionState(action, EMPTY);

  return (
    <form action={formAction} className="grid gap-3">
      <h2 className="text-xl">Target roles</h2>
      <p style={{ color: "var(--muted)" }}>
        Your top 5. These are what &ldquo;Open to work&rdquo; shows, and what job matching will
        rank against once Find Jobs is ported.
      </p>
      <ol className="grid gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i}>
            <input
              name={`role${i}`}
              className="field"
              defaultValue={roles[i] ?? ""}
              placeholder={i === 0 ? "e.g. Director of Data & AI" : ""}
              aria-label={`Target role ${i + 1}`}
            />
          </li>
        ))}
      </ol>
      <Status state={state} />
      <div>
        <SubmitButton>Save roles</SubmitButton>
      </div>
    </form>
  );
}
