import "server-only";

import type { Ats, Board } from "@/lib/boards-data";

/**
 * Reads company job boards through the public JSON each ATS already serves to
 * its own board page.
 *
 * This is the piece that changes the economics: the artifact discovers jobs by
 * driving a browser per user, so cost grows with every user looking at the
 * same postings. Crawling once into a shared table makes discovery a fixed
 * cost, and leaves per-user spend to scoring and tailoring alone.
 */

export type CrawledJob = {
  source: Ats;
  externalId: string;
  url: string;
  company: string;
  title: string;
  location: string;
  description: string;
  postedAt: Date | null;
};

/** Be a well-behaved client: identify, and never hammer. */
const UA = "SoleilRise/0.1 (+https://github.com/ravikv08/soleilrise-job-copilot)";
const TIMEOUT_MS = 20_000;
/** Descriptions are long; this is plenty for scoring and tailoring. */
const MAX_DESC = 30_000;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/** Greenhouse returns HTML with entities; everything downstream wants text. */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const clip = (s: string) => s.slice(0, MAX_DESC);
const asDate = (v: unknown): Date | null => {
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

type GhJob = {
  id: number;
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  first_published?: string;
  content?: string;
  location?: { name?: string };
};

type LeverJob = {
  id: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  descriptionPlain?: string;
  categories?: { location?: string };
};

type AshbyJob = {
  id: string;
  title?: string;
  location?: string;
  jobUrl?: string;
  applyUrl?: string;
  publishedAt?: string;
  descriptionPlain?: string;
  isListed?: boolean;
  isRemote?: boolean;
};

async function fetchBoard(board: Board): Promise<CrawledJob[]> {
  if (board.ats === "greenhouse") {
    const data = (await getJson(
      `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`,
    )) as { jobs?: GhJob[] };
    return (data.jobs ?? []).map((j) => ({
      source: "greenhouse" as const,
      externalId: String(j.id),
      url: j.absolute_url ?? "",
      company: board.name,
      title: j.title ?? "",
      location: j.location?.name ?? "",
      // content is HTML, and double-escaped on some boards.
      description: clip(htmlToText(j.content ?? "")),
      postedAt: asDate(j.first_published ?? j.updated_at),
    }));
  }

  if (board.ats === "lever") {
    const data = (await getJson(
      `https://api.lever.co/v0/postings/${board.token}?mode=json`,
    )) as LeverJob[];
    return (data ?? []).map((j) => ({
      source: "lever" as const,
      externalId: String(j.id),
      url: j.hostedUrl ?? j.applyUrl ?? "",
      company: board.name,
      title: j.text ?? "",
      location: j.categories?.location ?? "",
      description: clip(j.descriptionPlain ?? ""),
      postedAt: asDate(j.createdAt),
    }));
  }

  const data = (await getJson(
    `https://api.ashbyhq.com/posting-api/job-board/${board.token}`,
  )) as { jobs?: AshbyJob[] };
  return (data.jobs ?? [])
    // Ashby returns unlisted postings too; those are not open applications.
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      source: "ashby" as const,
      externalId: String(j.id),
      url: j.jobUrl ?? j.applyUrl ?? "",
      company: board.name,
      title: j.title ?? "",
      location: j.location ?? (j.isRemote ? "Remote" : ""),
      description: clip(j.descriptionPlain ?? ""),
      postedAt: asDate(j.publishedAt),
    }));
}

export type BoardResult =
  | { board: Board; ok: true; jobs: CrawledJob[] }
  | { board: Board; ok: false; error: string };

/**
 * Crawl boards a few at a time. Deliberately not all at once: these are other
 * people's servers, and a burst of 139 parallel requests is the kind of thing
 * that gets a crawler blocked.
 */
export async function crawlBoards(
  boards: Board[],
  concurrency = 4,
): Promise<BoardResult[]> {
  const out: BoardResult[] = [];
  for (let i = 0; i < boards.length; i += concurrency) {
    const slice = boards.slice(i, i + concurrency);
    const settled = await Promise.all(
      slice.map(async (board): Promise<BoardResult> => {
        try {
          return { board, ok: true, jobs: await fetchBoard(board) };
        } catch (e) {
          return { board, ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
    out.push(...settled);
  }
  return out;
}

/** Keep only postings that look real and recent enough to be worth scoring. */
export function usable(j: CrawledJob, maxAgeDays: number): boolean {
  if (!j.externalId || !j.title || !j.url) return false;
  if (j.description.trim().length < 400) return false;
  if (!j.postedAt) return true; // no date is not evidence of being stale
  return (Date.now() - j.postedAt.getTime()) / 86_400_000 <= maxAgeDays;
}

/** US-only, matching the artifact's scope. */
export function inUS(location: string): boolean {
  const s = location.toLowerCase();
  if (!s) return false;
  if (/\bremote\b/.test(s) && !/\b(emea|apac|uk|europe|canada|india|latam)\b/.test(s)) {
    return true;
  }
  return /\b(usa|united states|us)\b|,\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)\b/.test(
    s,
  );
}
