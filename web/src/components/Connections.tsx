"use client";

import { useState, useTransition } from "react";

import type { ActionState } from "@/app/actions/profile";
import type { NetGroup } from "@/lib/linkedin";

function Draft({
  id,
  group,
  existing,
  action,
}: {
  id: string;
  group: string;
  existing?: string;
  action: (id: string, group: string) => Promise<ActionState>;
}) {
  const [pending, start] = useTransition();
  const [text, setText] = useState(existing ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          className="btn small ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await action(id, group);
              setErr(r.ok ? null : (r.message ?? "Failed"));
            })
          }
        >
          {pending ? "Writing…" : text ? "Rewrite message" : "Write a message"}
        </button>
        {text ? (
          <button
            className="btn small ghost"
            onClick={() => {
              navigator.clipboard?.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
      </div>
      {err ? <div className="notice err">{err}</div> : null}
      {text ? (
        <textarea
          className="field"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Outreach message"
        />
      ) : null}
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
  outreach: Record<string, string>;
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
