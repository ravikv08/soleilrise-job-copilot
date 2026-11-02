"use client";

import { useState, useTransition } from "react";

import type { ActionState } from "@/app/actions/profile";

export function ActionButton({
  run,
  label,
  pendingLabel,
  ghost,
}: {
  run: () => Promise<ActionState>;
  label: string;
  pendingLabel: string;
  ghost?: boolean;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);

  return (
    <div className="grid gap-2">
      <div>
        <button
          className={ghost ? "btn ghost" : "btn"}
          disabled={pending}
          onClick={() => start(async () => setState(await run()))}
        >
          {pending ? pendingLabel : label}
        </button>
      </div>
      {state?.message ? (
        <div className={`notice ${state.ok ? "ok" : "err"}`}>{state.message}</div>
      ) : null}
    </div>
  );
}

export function AddButton({
  jobId,
  action,
  disabled,
}: {
  jobId: string;
  action: (id: string) => Promise<ActionState>;
  disabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(disabled);

  return (
    <button
      className="btn small"
      disabled={pending || done}
      onClick={() =>
        start(async () => {
          await action(jobId);
          setDone(true);
        })
      }
    >
      {done ? "In studio" : pending ? "Adding…" : "Tailor for this"}
    </button>
  );
}
