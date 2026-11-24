"use client";

import { useState, useTransition } from "react";

import type { ActionState } from "@/app/actions/profile";
import type { Outreach } from "@/app/actions/connect";
import type { NetGroup } from "@/lib/linkedin";

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState(value);

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <b className="text-sm">{label}</b>
        {hint ? (
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {hint}
          </span>
        ) : null}
        <button
          className="btn small ghost"
          style={{ marginLeft: "auto" }}
          onClick={() => {
            navigator.clipboard?.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea
        className="field"
        rows={label === "Connection note" ? 3 : label === "InMail subject" ? 1 : 6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={label}
      />
    </div>
  );
}

function Draft({
  id,
  group,
  existing,
  action,
}: {
  id: string;
  group: string;
  existing?: Outreach | string;
  action: (id: string, group: string) => Promise<ActionState>;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  // Drafts written before the InMail formats existed were a single string.
  // Show them as the note rather than rendering nothing at all.
  const d: Outreach | undefined =
    typeof existing === "string" ? { note: existing } : existing;

  return (
    <div className="grid gap-3">
      <div>
        <button
          className="btn small ghost"
          disabled={pending}
          onClick={() => start(async () => setState(await action(id, group)))}
        >
          {pending ? "Writing…" : d?.note ? "Rewrite messages" : "Write the messages"}
        </button>
      </div>

      {state?.message ? (
        <div className={`notice ${state.ok ? "ok" : "warn"}`}>{state.message}</div>
      ) : null}

      {d?.note ? (
        <Field
          label="Connection note"
          value={d.note}
          hint={`${d.note.length}/300 — free, no Premium needed`}
        />
      ) : null}
      {d?.inmailSubject ? <Field label="InMail subject" value={d.inmailSubject} /> : null}
      {d?.inmail ? (
        <Field label="InMail body" value={d.inmail} hint="Uses a Premium credit — send to the best match only" />
      ) : null}
      {d?.followUp ? <Field label="Follow-up (5-7 days later)" value={d.followUp} /> : null}
    </div>
  );
}

export function Connections({
  id,
  plan,
  why,
  named,
  outreach,
  readTeam,
  draft,
  hasRead,
}: {
  id: string;
  plan: NetGroup[];
  why?: string;
  named: { name: string; role?: string; url: string }[];
  outreach: Record<string, Outreach | string>;
  readTeam: (id: string) => Promise<ActionState>;
  draft: (id: string, group: string) => Promise<ActionState>;
  hasRead: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);

  return (
    <section className="card grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl" style={{ flex: 1 }}>
          Connections &amp; referrals
        </h2>
        <button
          className="btn small ghost"
          disabled={pending}
          onClick={() => start(async () => setMsg(await readTeam(id)))}
        >
          {pending ? "Reading the posting…" : hasRead ? "Re-read the posting" : "Target from the posting"}
        </button>
      </div>

      <p style={{ color: "var(--muted)" }}>
        Optional, and often the fastest way in — a referral gets an application looked at. These
        are LinkedIn searches you run yourself, signed in as you. Nothing here logs into LinkedIn
        or reads it; the searches find likely people, they do not confirm who the hiring manager
        is.
      </p>

      {msg?.message ? (
        <div className={`notice ${msg.ok ? "ok" : "err"}`}>{msg.message}</div>
      ) : null}

      {why ? (
        <div className="notice ok">
          <b>Start here:</b> {why}
        </div>
      ) : null}

      {named.length ? (
        <div className="grid gap-2 rounded-xl p-3" style={{ background: "var(--good-bg)" }}>
          <b style={{ color: "var(--good)" }}>Named in the posting</b>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            The posting itself names these people, so they are directly involved.
          </span>
          {named.map((n, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3">
              <span style={{ flex: 1 }}>
                {n.name}
                {n.role ? ` · ${n.role}` : ""}
              </span>
              <a className="btn small" href={n.url} target="_blank" rel="noopener noreferrer">
                Find on LinkedIn ↗
              </a>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3">
        {plan.map((g, i) => (
          <div
            key={g.key}
            className="grid gap-2 rounded-xl p-3"
            style={{ background: "var(--sunk)" }}
          >
            <b>
              <span
                style={{
                  display: "inline-grid",
                  placeItems: "center",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                  fontSize: "0.75rem",
                  marginRight: 8,
                }}
              >
                {i + 1}
              </span>
              {g.label}
            </b>
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {g.why}
            </span>
            <div className="flex flex-wrap gap-2">
              {g.links.map((l, k) => (
                <a
                  key={k}
                  className={k === 0 ? "btn small" : "btn small ghost"}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {l.label} ↗
                </a>
              ))}
            </div>
            <Draft id={id} group={g.key} existing={outreach[g.key]} action={draft} />
          </div>
        ))}
      </div>
    </section>
  );
}
