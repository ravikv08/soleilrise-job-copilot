/**
 * LinkedIn search links, ported from the artifact's netPlan().
 *
 * These are ordinary LinkedIn search URLs the person clicks and runs
 * themselves, signed in as themselves. Nothing here logs in, scrapes, reads
 * or automates LinkedIn — that would breach LinkedIn's terms and put the
 * account at risk, and it is the one line this product does not cross.
 * Premium matters because it widens what those searches return and gives
 * InMail to reach people outside the network.
 */
import type { MasterResume } from "@/lib/resume";

/** What the model infers about the hiring team from the posting. */
export type NetworkRead = {
  department?: string;
  team_keywords?: string[];
  function_keywords?: string[];
  manager_titles?: string[];
  peer_titles?: string[];
  recruiter_focus?: string;
  recruiter_keywords?: string[];
  why?: string;
  named_in_posting?: { name: string; role?: string }[];
};

export const LEADER = /(head|vp|vice president|director|chief|senior manager|sr\.? manager)/i;

/** Strip legal suffixes so the search matches how people write it. */
export const coName = (company: string) =>
  String(company || "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .trim()
    .replace(/,?\s+(inc|llc|corp|corporation|ltd)\.?$/i, "")
    .trim();

/** A people search, optionally scoped to a company and a network degree. */
function peopleSearch(keywords: string, company?: string, network?: string[]): string {
  const p = new URLSearchParams({ keywords, origin: "FACETED_SEARCH" });
  if (company) p.set("company", company);
  if (network) p.set("network", JSON.stringify(network));
  return `https://www.linkedin.com/search/results/people/?${p.toString()}`;
}

/** A search for one named person at one company. */
export const findPerson = (name: string, company: string) =>
  peopleSearch(`"${name}" "${coName(company)}"`);

export type NetGroup = {
  key: "hm" | "recruiter" | "connection";
  label: string;
  why: string;
  links: { label: string; url: string }[];
};

const uniq = (a: (string | undefined)[]) => [
  ...new Set(a.filter(Boolean).map((x) => String(x).trim()).filter((x) => x.length > 1)),
];
const orTerms = (a: string[]) => (a.length ? `(${a.map((x) => `"${x}"`).join(" OR ")})` : "");

/**
 * The three searches: who owns the hire, who recruits for that team, and who
 * could introduce you. Built from what the model read out of the posting,
 * falling back to the title when it has not been read yet.
 */
export function netPlan(
  company: string,
  title: string,
  net: NetworkRead | null,
  resume: MasterResume | null,
): NetGroup[] {
  const co = coName(company);
  const t = String(title || "");
  const n = net ?? {};

  const team = uniq(n.team_keywords ?? []).slice(0, 4);
  const fn = uniq(
    n.function_keywords?.length
      ? n.function_keywords
      : t.match(
          /\b(machine learning|AI|ML|data engineering|data|analytics|platform|agents?|genai|solutions|security|infrastructure)\b/gi,
        ) ?? ["engineering"],
  ).slice(0, 3);

  const lv = uniq(
    (n.manager_titles ?? [])
      .join(" | ")
      .match(
        /managing director|executive director|senior director|vice president|engineering manager|senior manager|director|head|\bvp\b|manager/gi,
      ) ?? [],
  ).map((x) => x.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Vp$/, "VP"));

  const mgr = uniq(
    lv.length
      ? lv
      : LEADER.test(t)
        ? ["VP", "Senior Director", "Head"]
        : ["Engineering Manager", "Senior Manager", "Director"],
  ).slice(0, 4);

  const peers = uniq(n.peer_titles ?? []).slice(0, 3);
  const rk = uniq(n.recruiter_keywords?.length ? n.recruiter_keywords : fn).slice(0, 3);

  const past = (resume?.experience ?? [])
    .map((e) => coName(e.company))
    .filter((x) => x && x.toLowerCase() !== co.toLowerCase())
    .slice(0, 4);

  const schools = (resume?.education ?? [])
    .map((e) => (String(e.text).match(/University of [A-Z][a-z]+|[A-Z][a-z]+ University/) ?? [])[0])
    .filter((x): x is string => !!x)
    .slice(0, 2);

  const area = team.length ? team : fn;
  const where = n.department || (team.length ? team.join(" / ") : fn.join(" / "));

  return [
    {
      key: "hm",
      label: "Hiring team",
      why: `${mgr.slice(0, 3).join(", ")} on ${where} at ${co}: the people most likely to own this hire. Message the best match directly.`,
      links: [
        { label: "Search the team", url: peopleSearch(`"${co}" ${orTerms(mgr)} ${orTerms(area)}`, co) },
        ...(team.length
          ? [
              {
                label: `Wider: ${fn.join(", ")}`,
                url: peopleSearch(`"${co}" ${orTerms(mgr)} ${orTerms(fn)}`, co),
              },
            ]
          : []),
      ],
    },
    {
      key: "recruiter",
      label: "Recruiter for this team",
      why: `Recruiters at ${co} who hire for ${n.recruiter_focus || fn.join(", ")}. Tell them you applied, with the job link.`,
      links: [
        {
          label: "Search recruiters",
          url: peopleSearch(
            `"${co}" (recruiter OR "talent acquisition" OR sourcer) ${orTerms(rk)}`,
            co,
          ),
        },
      ],
    },
    {
      key: "connection",
      label: "Warm intro or referral",
      why: `Your 1st-degree connections at ${co} first, then 2nd-degree people on ${where}${peers.length ? ` (${peers.join(", ")})` : ""} a mutual can introduce, then former colleagues${past.length ? ` from ${past.slice(0, 3).join(", ")}` : ""}. Most companies pay a referral bonus.`,
      links: [
        { label: "1st-degree", url: peopleSearch(`"${co}"`, co, ["F"]) },
        {
          label: "2nd-degree on the team",
          url: peopleSearch(
            `"${co}" ${orTerms(peers.length ? uniq([...peers, ...area]).slice(0, 5) : area)}`,
            co,
            ["S"],
          ),
        },
        ...(past.length || schools.length
          ? [
              {
                label: "Former colleagues",
                url: peopleSearch(`"${co}" ${orTerms([...past, ...schools])}`, co),
              },
            ]
          : []),
      ],
    },
  ];
}
