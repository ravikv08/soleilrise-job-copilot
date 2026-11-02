"use client";

import { useActionState, useState, useTransition } from "react";

import type { ActionState } from "@/app/actions/profile";
import { SubmitButton } from "@/components/SubmitButton";

const EMPTY: ActionState = { ok: true };

export function PostingForm({
  action,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, EMPTY);

  return (
    <form action={formAction} className="grid gap-3">
      <h2 className="text-xl">Add a posting</h2>
      <p style={{ color: "var(--muted)" }}>
        Paste the full job description. The posting is treated as untrusted text — instructions
        hidden inside it are never followed.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <input name="company" className="field" placeholder="Company (optional)" />
        <input name="title" className="field" placeholder="Title (optional)" />
      </div>
      <input name="url" className="field" placeholder="Posting URL (optional)" />
      <textarea
        name="jd"
        className="field"
        rows={10}
        placeholder="Paste the whole job description here"
      />

      {state.message ? (
        <div className={`notice ${state.ok ? "ok" : "err"}`}>{state.message}</div>
      ) : null}
      <div>
        <SubmitButton>Save posting</SubmitButton>
      </div>
    </form>
  );
}

export function TailorButton({
  id,
  action,
  label = "Tailor my resume",
}: {
  id: string;
  action: (id: string) => Promise<ActionState>;
  label?: string;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);

  return (
    <div className="grid gap-2">
      <div>
        <button
          className="btn"
          disabled={pending}
          onClick={() => start(async () => setState(await action(id)))}
        >
          {pending ? "Tailoring… this takes about a minute" : label}
        </button>
      </div>
      {state?.message ? (
        <div className={`notice ${state.ok ? "ok" : "err"}`}>{state.message}</div>
      ) : null}
    </div>
  );
}
