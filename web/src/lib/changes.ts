/**
 * The change engine, ported from the artifact (computeChanges / finalResume).
 *
 * This is what makes the product auditable: the model returns a tailored
 * resume, and this turns it into a list of discrete, individually rejectable
 * changes against the master. Nothing reaches a download that the person has
 * not seen as a before/after pair.
 */
import { BANNED, type MasterResume, type SkillGroup, type TailorResult } from "@/lib/resume";

export type Change = {
  id: string;
  op: "Rewrite" | "Reorder" | "Edit" | "Add" | "Remove";
  cls?: "add" | "rm";
  where: string;
  before: string;
  after: string;
  reason?: string;
  /** Set when the change needs a human decision regardless of wording. */
  flag?: string;
  /** Banned filler words found in the new text. */
  banned?: string[];
};

/** Accepted/rejected decisions, keyed by Change.id. Absent means accepted. */
export type Decisions = Record<string, boolean>;
/** Hand edits that override the model's text, keyed by Change.id. */
export type Edits = Record<string, string>;

export const skillsLines = (sk: SkillGroup[] | undefined) =>
  (sk ?? []).map((s) => `${s.label}: ${s.items}`).join("\n");

/** Resolve a bullet source id ("E0.3", "P1") back to the master's text. */
export function srcText(m: MasterResume, src: string | null | undefined): string | undefined {
  const e = /^E(\d+)\.(\d+)$/.exec(src ?? "");
  if (e) return m.experience?.[+e[1]]?.bullets?.[+e[2]];
  const p = /^P(\d+)$/.exec(src ?? "");
  if (p) return m.projects?.[+p[1]];
  return undefined;
}

const bannedIn = (t: string) =>
  BANNED.filter((b) => String(t).toLowerCase().includes(b));

export function computeChanges(m: MasterResume, r: TailorResult): Change[] {
  const ch: Change[] = [];

  if (r.headline && r.headline.trim() !== (m.headline ?? "").trim()) {
    ch.push({
      id: "headline", op: "Rewrite", where: "Headline",
      before: m.headline ?? "", after: r.headline,
      reason: r.reasons?.headline, banned: bannedIn(r.headline),
    });
  }
  if (r.summary && r.summary.trim() !== (m.summary ?? "").trim()) {
    ch.push({
      id: "summary", op: "Rewrite", where: "Summary",
      before: m.summary ?? "", after: r.summary,
      reason: r.reasons?.summary, banned: bannedIn(r.summary),
    });
  }
  if (r.skills?.length && skillsLines(r.skills) !== skillsLines(m.skills)) {
    ch.push({
      id: "skills", op: "Reorder", where: "Technical skills",
      before: skillsLines(m.skills), after: skillsLines(r.skills),
      reason: r.reasons?.skills, banned: bannedIn(skillsLines(r.skills)),
    });
  }

  type List = {
    key: string;
    label: string;
    orig: string[];
    prefix: string;
    out?: { src: string | null; text: string; reason?: string }[];
  };
  const lists: List[] = [];
  (m.experience ?? []).forEach((e, i) =>
    lists.push({
      key: `E${i}`, label: e.company, orig: e.bullets ?? [], prefix: `E${i}.`,
      out: (r.experience ?? []).find((x) => +x.i === i)?.bullets,
    }),
  );
  if (m.projects?.length) {
    lists.push({ key: "P", label: "Projects", orig: m.projects, prefix: "P", out: r.projects });
  }

  for (const L of lists) {
    if (!Array.isArray(L.out)) continue;
    const used = new Set<string>();

    L.out.forEach((b, k) => {
      const t = srcText(m, b.src);
      if (b.src && t !== undefined && String(b.src).startsWith(L.prefix)) {
        used.add(b.src);
        if (String(b.text).trim() !== t.trim()) {
          ch.push({
            id: `edit:${b.src}`, op: "Edit", where: L.label,
            before: t, after: b.text, reason: b.reason, banned: bannedIn(b.text),
          });
        }
      } else {
        // A bullet with no source in the master resume. Always needs a human
        // decision — this is the only path by which new text can appear.
        ch.push({
          id: `add:${L.key}:${k}`, op: "Add", cls: "add", where: L.label,
          before: "", after: b.text, reason: b.reason,
          flag: "New bullet: confirm it's true", banned: bannedIn(b.text),
        });
      }
    });

    L.orig.forEach((t, j) => {
      const src = L.prefix + j;
      if (used.has(src)) return;
      ch.push({
        id: `rm:${src}`, op: "Remove", cls: "rm", where: L.label,
        before: t, after: "",
        reason:
          (r.removed ?? []).find((x) => x.src === src)?.reason ||
          "Low relevance for this role; keeps the resume at 2 pages.",
      });
    });
  }

  return ch;
}

/**
 * Apply the accepted changes to the master resume. A rejected change leaves
 * the master's original text in place, so rejecting everything returns the
 * master resume unchanged.
 */
export function finalResume(
  m: MasterResume,
  r: TailorResult,
  dec: Decisions = {},
  edits: Edits = {},
): MasterResume {
  const on = (id: string) => dec[id] !== false;
  const val = (id: string, t: string) => (edits[id] != null ? edits[id] : t);
  const out: MasterResume = JSON.parse(JSON.stringify(m));

  if (r.headline && on("headline")) out.headline = val("headline", r.headline);
  if (r.summary && on("summary")) out.summary = val("summary", r.summary);
  if (r.skills?.length && on("skills")) out.skills = r.skills;

  const build = (
    orig: string[],
    list: { src: string | null; text: string }[] | undefined,
    prefix: string,
    key: string,
  ): string[] => {
    if (!Array.isArray(list)) return orig;
    const res: string[] = [];
    const used = new Set<string>();
    list.forEach((b, k) => {
      const t = srcText(m, b.src);
      if (b.src && t !== undefined && String(b.src).startsWith(prefix)) {
        used.add(b.src);
        res.push(on(`edit:${b.src}`) ? val(`edit:${b.src}`, b.text) : t);
      } else if (on(`add:${key}:${k}`)) {
        res.push(val(`add:${key}:${k}`, b.text));
      }
    });
    orig.forEach((t, j) => {
      if (!used.has(prefix + j) && !on(`rm:${prefix}${j}`)) res.push(t);
    });
    return res;
  };

  out.experience = (m.experience ?? []).map((e, i) => ({
    ...e,
    bullets: build(
      e.bullets ?? [],
      (r.experience ?? []).find((x) => +x.i === i)?.bullets,
      `E${i}.`,
      `E${i}`,
    ),
  }));
  if (m.projects) out.projects = build(m.projects, r.projects, "P", "P");

  return out;
}

/** Changes that need a human look: new bullets, or filler the prompt bans. */
export const needsReview = (changes: Change[], dec: Decisions = {}) =>
  changes.filter((c) => dec[c.id] !== false && (c.flag || (c.banned ?? []).length));
