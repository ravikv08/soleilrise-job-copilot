"use client";

import { useState, useTransition } from "react";

import type { ActionState } from "@/app/actions/profile";
import { STATUS } from "@/db/schema";

/** The statuses worth offering by hand; the rest are set by the studio flow. */
const PICKABLE = [
  "Applied",
  "Submission failed",
  "Recruiter replied",
  "Interview",
  "Offer",
  "Rejected",
  "Archived",
] as const satisfies readonly (typeof STATUS)[number][];

export function StatusPicker({
  id,
  status,
  action,
}: {
  id: string;
  status: string;
  action: (id: string, status: (typeof STATUS)[number]) => Promise<ActionState>;
}) {
  const [pending, start] = useTransition();
  const [local, setLocal] = useState(status);

  return (
    <select
      className="field"
      style={{ width: "auto", padding: "6px 10px", fontSize: "0.85rem" }}
      value={local}
      disabled={pending}
      aria-label="Application status"
      onChange={(e) => {
        const next = e.target.value as (typeof STATUS)[number];
        setLocal(next);
        start(async () => {
          await action(id, next);
        });
      }}
    >
      {/* Keep whatever the studio set, even when it is not hand-pickable. */}
      {!(PICKABLE as readonly string[]).includes(local) ? (
        <option value={local}>{local}</option>
      ) : null}
      {PICKABLE.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
