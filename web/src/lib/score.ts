/**
 * Scoring, ported from the artifact so a resume scores identically in both.
 *
 * The model estimates per-requirement support; the weights live here, on our
 * side, so the score is something we compute rather than something the model
 * hands us.
 */
import type { Keyword, MasterResume, TailorResult } from "@/lib/resume";

/** Flatten a resume to the text keyword coverage is measured against. */
export function resumeText(r: MasterResume | null): string {
  if (!r) return "";
  return [
    r.name,
    ...(r.contact ?? []),
    r.headline,
    r.summary,
    ...(r.experience ?? []).flatMap((e) => [`${e.company} ${e.title}`, ...(e.bullets ?? [])]),
    ...(r.projects ?? []),
    ...(r.skills ?? []).map((s) => `${s.label}: ${s.items}`),
    ...(r.education ?? []).flatMap((e) => [e.text, ...(e.sub ?? [])]),
  ].join("\n");
}

export type Coverage = { term: string; hit: boolean };

/** Whole-word match of each keyword (or any of its variants) in the text. */
export function kwCover(kws: Keyword[] | undefined, text: string): Coverage[] {
  const t = text.toLowerCase();
  return (kws ?? []).map((k) => ({
    term: k.term,
    hit: (k.variants?.length ? k.variants : [k.term]).some((v) => {
      const s = String(v).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9])${s}($|[^a-z0-9])`).test(t);
    }),
  }));
}

export type ScoreParts = {
  must: number;
  pref: number;
  kw: number;
  seniority: number;
  domain: number;
  logistics: number;
  total: number;
};

/**
 * Weights: required 40, preferred 15, keywords 15, seniority 15, domain 10,
 * logistics 5. `which` picks the master resume ("before") or the tailored one
 * ("after").
 */
export function scoreOf(
  r: TailorResult,
  which: "before" | "after",
  kwRatio: number,
): ScoreParts {
  const avg = (a: { before: number; after: number }[] | undefined) =>
    a?.length ? a.reduce((s, x) => s + (Number(x[which]) || 0), 0) / a.length : 0;

  const parts = {
    must: 40 * avg(r.must),
    pref: 15 * avg(r.pref),
    kw: 15 * kwRatio,
    seniority: Math.min(15, Number(r.seniority?.[which]) || 0),
    domain: Math.min(10, Number(r.domain?.[which]) || 0),
    logistics: Math.min(5, Number(r.logistics?.score) || 0),
  };
  const total = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  return { ...parts, total };
}

const ratio = (a: Coverage[]) => (a.length ? a.filter((x) => x.hit).length / a.length : 0);

/** Before/after scores for one tailored posting. */
export function analyse(master: MasterResume | null, result: TailorResult | null) {
  if (!master || !result) return null;
  const before = kwCover(result.keywords, resumeText(master));
  // Score the after-text over the same sections as the before-text. The
  // tailored result only replaces the headline, summary, skills, bullets and
  // projects; name, contact and education carry over from the master resume
  // untouched. Leaving them out would count a keyword that lives only in,
  // say, a certification under education as present before and missing
  // after, and report the tailoring as having lowered the score.
  const after = kwCover(
    result.keywords,
    resumeText({
      ...master,
      headline: result.headline || master.headline,
      summary: result.summary || master.summary,
      skills: result.skills?.length ? result.skills : master.skills,
      projects: (result.projects ?? []).length
        ? result.projects.map((p) => p.text)
        : master.projects,
      experience: (master.experience ?? []).map((role, i) => {
        const tailored = (result.experience ?? []).find((e) => e.i === i);
        return tailored ? { ...role, bullets: tailored.bullets.map((b) => b.text) } : role;
      }),
    }),
  );

  return {
    before: scoreOf(result, "before", ratio(before)),
    after: scoreOf(result, "after", ratio(after)),
    coverageBefore: before,
    coverageAfter: after,
  };
}

/** Fit label, matching the artifact's tiers. */
export function tier(n: number): [string, string] {
  return n >= 80 ? ["strong", "Strong fit"] : n >= 70 ? ["mid", "Moderate fit"] : ["low", "Stretch"];
}
