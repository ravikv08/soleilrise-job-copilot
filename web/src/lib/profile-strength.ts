/**
 * Profile strength, ported from the artifact (catScores / resumeYears / band).
 *
 * Scores how strongly a resume *proves* each area a recruiter screens for,
 * rather than whether the words appear. Three parts, deliberately weighted:
 * distinct vocabulary (0.35), the share of bullets that show it (0.35), and
 * years in roles centred on it (0.3). Breadth alone cannot carry a score.
 */
import type { MasterResume } from "@/lib/resume";
import { resumeText } from "@/lib/score";

export const CATS = [
  {
    k: "AI",
    t: ["ai","ml","machine learning","llm","genai","generative","agent","agents","multi-agent","rag","mcp","fine-tun","model","models","nlp","vision","openai","claude","gemini","embedding","inference","gpu","cuda","prompt","clip"],
  },
  {
    k: "Data",
    t: ["data platform","data warehouse","lakehouse","data lake","etl","elt","spark","pyspark","databricks","snowflake","redshift","dbt","airflow","sql","pipeline","pipelines","governance","kafka","glue","informatica","analytics","bi","tableau","data engineering","data quality"],
  },
  {
    k: "Leadership",
    t: ["led","lead","managed","manager","director","head","team","teams","roadmap","stakeholder","vendor","hired","mentored","strategy","budget","executive","owned","partnered","cross-functional","offshore","onshore","ceo","vp"],
  },
  {
    k: "Startups",
    t: ["startup","founder","founded","0 to 1","zero to","whiteboard concept","prototype","poc","series","early-stage","consulting","fintech-startup","built","end to end","end-to-end"],
  },
  {
    k: "Fintech",
    t: ["fintech","payments","payment","fraud","bank","banks","credit","risk","ledger","transactions","card"],
  },
] as const;

export type CatScore = {
  k: string;
  score: number;
  hits: string[];
  share: number;
  years: number;
};

const norm = (t: string) =>
  " " + String(t).toLowerCase().replace(/[^a-z0-9+\- ]/g, " ").replace(/\s+/g, " ") + " ";

const has = (txt: string, w: string) =>
  txt.includes(" " + w + " ") || (w.length > 5 && txt.includes(w));

/** Years spanned by one role's date range; "present" counts to this year. */
function yearsOf(dates: string): number {
  const ys = (String(dates).match(/(19|20)\d{2}/g) ?? []).map(Number);
  if (!ys.length) return 0;
  const end = /present|current/i.test(dates) ? new Date().getFullYear() : Math.max(...ys, 0);
  return Math.max(0.5, end - Math.min(...ys));
}

/** Total years from the earliest date on the resume to now. */
export function resumeYears(r: MasterResume | null): number {
  const ys = (r?.experience ?? []).flatMap((e) =>
    (String(e.dates).match(/(19|20)\d{2}/g) ?? []).map(Number),
  );
  return ys.length ? new Date().getFullYear() - Math.min(...ys) : 0;
}

export function catScores(r: MasterResume): CatScore[] {
  const bullets = (r.experience ?? []).flatMap((e) =>
    (e.bullets ?? []).map((b) => norm(`${b} ${e.title} ${e.company}`)),
  );
  const all = norm(resumeText(r));
  const totalY = (r.experience ?? []).reduce((s, e) => s + yearsOf(e.dates), 0) || 1;

  return CATS.map((c) => {
    const distinct = c.t.filter((w) => has(all, w));
    const share = bullets.length
      ? bullets.filter((b) => c.t.some((w) => has(b, w))).length / bullets.length
      : 0;
    const roleY =
      (r.experience ?? [])
        .filter((e) => {
          const h = norm(`${e.title} ${e.company} ${(e.bullets ?? []).join(" ")}`);
          return c.t.filter((w) => has(h, w)).length >= 3;
        })
        .reduce((s, e) => s + yearsOf(e.dates), 0) / totalY;

    const score = Math.round(
      100 *
        (0.35 * Math.min(1, distinct.length / (c.t.length * 0.6)) +
          0.35 * Math.min(1, share / 0.6) +
          0.3 * Math.min(1, roleY)),
    );

    return {
      k: c.k,
      score: Math.max(5, Math.min(99, score)),
      hits: distinct.slice(0, 6),
      share: Math.round(share * 100),
      years: Math.round(roleY * totalY),
    };
  });
}

export const band = (n: number) => (n >= 80 ? "good" : n >= 65 ? "mid" : "bad");

/** Completeness checklist shown under the rings. */
export function completeness(
  r: MasterResume | null,
  applicant: { workAuth?: string; linkedin?: string },
  targetRoles: string[],
): { label: string; done: boolean }[] {
  return [
    { label: "Master resume", done: !!r },
    { label: "Headline and About", done: !!(r?.headline && r?.summary) },
    { label: "Work authorization", done: !!applicant.workAuth },
    { label: "Target roles saved", done: targetRoles.length > 0 },
    {
      label: "LinkedIn URL",
      done: !!(applicant.linkedin || /linkedin\.com/i.test((r?.contact ?? []).join(" "))),
    },
  ];
}
