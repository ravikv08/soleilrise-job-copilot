"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import type { ActionState } from "@/app/actions/profile";
import type { Change } from "@/lib/changes";

export const STEPS = [
  [1, "AI Tailoring"],
  [2, "Review Changes"],
  [3, "Match Summary"],
  [4, "Final Approval"],
] as const;

export function StepNav({
  id,
  step,
  hasResult,
  approved,
}: {
  id: string;
  step: number;
  hasResult: boolean;
  approved: boolean;
}) {
  return (
    <ol className="rs-steps">
      {STEPS.map(([k, label], i) => {
        const done = approved || (hasResult && k < step) || (hasResult && k === 1);
        const cur = !approved && k === step;
        const disabled = !hasResult && k > 1;
        return (
          <li key={k} className={cur ? "cur" : done ? "done" : ""}>
            {i > 0 ? <i className="sep" aria-hidden /> : null}
            {disabled ? (
              <button type="button" disabled>
                <span>{k}</span>
                {label}
              </button>
            ) : (
              <Link href={`/studio/${id}?step=${k}`} className="rs-step-link">
                <span>{done && !cur ? "✓" : k}</span>
                {label}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One change, with its before/after and an accept/reject toggle.
 *
 * Rejecting is the whole point of this screen: the master resume's wording
 * comes back, so nothing a person has not agreed to can reach a download.
 */
export function ChangeRow({
  id,
  change,
  accepted,
  action,
}: {
  id: string;
  change: Change;
  accepted: boolean;
  action: (id: string, changeId: string, accepted: boolean) => Promise<ActionState>;
}) {
  const [pending, start] = useTransition();
  const [local, setLocal] = useState(accepted);

  const toggle = () =>
    start(async () => {
      const next = !local;
      setLocal(next);
      await action(id, change.id, next);
    });

  const flagged = !!change.flag || (change.banned ?? []).length > 0;

  return (
    <li className={`rs-change${local ? "" : " off"}${flagged ? " flag" : ""}`}>
      <div className="rs-change-head">
        <span className={`rs-op rs-op-${change.op.toLowerCase()}`}>{change.op}</span>
        <b>{change.where}</b>
        <button
          className="btn small ghost"
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={local}
        >
          {pending ? "…" : local ? "Accepted — reject" : "Rejected — accept"}
        </button>
      </div>

      {change.before ? (
        <p className="rs-before">
          <del>{change.before}</del>
        </p>
      ) : null}
      {change.after ? (
        <p className="rs-after">
          <ins>{change.after}</ins>
        </p>
      ) : null}

      {change.reason ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {change.reason}
        </p>
      ) : null}

      {change.flag ? <div className="notice warn">{change.flag}</div> : null}
      {(change.banned ?? []).length ? (
        <div className="notice warn">
          Contains wording the house style bans: {change.banned!.join(", ")}
        </div>
      ) : null}
    </li>
  );
}

export function ApproveButton({
  id,
  action,
  label,
  ghost,
}: {
  id: string;
  action: (id: string) => Promise<ActionState>;
  label: string;
  ghost?: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="grid gap-2">
      <div>
        <button
          className={ghost ? "btn ghost" : "btn big"}
          disabled={pending}
          onClick={() => start(async () => setMsg((await action(id)).message ?? null))}
        >
          {pending ? "Working…" : label}
        </button>
      </div>
      {msg ? <div className="notice ok">{msg}</div> : null}
    </div>
  );
}
