# SoleilRise web (Phase 1)

The product version of the artifact in `../app/index.html`: a Next.js app with its own
database, its own auth, and server-side Claude calls that are metered per user.

The artifact still works and is unchanged. This runs alongside it.

## What exists so far

| Piece | State |
|---|---|
| Postgres schema + migration | Done — `src/db/schema.ts`, `drizzle/0000_init.sql` |
| Auth (Google / GitHub) | Wired, needs OAuth credentials |
| Server-side Claude + token metering | Done — every call lands in `ai_usage` |
| Profile: master resume, facts, work authorization | Done |
| Resume Studio: paste a posting, tailor, score, gaps | Done |
| DOCX / PDF download | Not ported yet |
| Job discovery, interview prep, applications tracking | Not ported yet (Phase 2+) |

## Setup

You need a Postgres database and an Anthropic API key. Neon and Supabase both have a
free tier; nothing here depends on either specifically.

```bash
cd web
npm install
cp .env.example .env.local     # fill in DATABASE_URL and ANTHROPIC_API_KEY
npx auth secret                # writes AUTH_SECRET into .env.local
npm run db:migrate             # creates the tables
npm run dev
```

For sign-in, add at least one OAuth provider to `.env.local`. For Google, create an
OAuth client at <https://console.cloud.google.com/apis/credentials> with the redirect
URI `http://localhost:3000/api/auth/callback/google`. The sign-in page says so too if
no provider is configured.

## Checks

```bash
npm run typecheck && npm run lint && npm run build
```

## The one number that matters

`ai_usage` records every model call with the exact token counts the API returned. Once
a few resumes have gone through, this is your real cost per tailoring:

```sql
select operation,
       count(*)                           as calls,
       round(avg(input_tokens))           as avg_in,
       round(avg(output_tokens))          as avg_out,
       round(avg(cost_usd)::numeric, 4)   as avg_usd,
       round(sum(cost_usd)::numeric, 2)   as total_usd
from ai_usage
group by operation
order by total_usd desc;
```

Price a plan on that number, not on an estimate.

Token counts are exact and come straight from the API; the dollars are derived
from the rate table in `src/lib/pricing.ts`. Re-check those rates against current
pricing before you set a price — past rows recompute from their stored token
counts, so a rate correction needs no backfill.

### Model choice and spend

Everything runs on **Claude Opus 5.5** (`src/lib/pricing.ts`). Cheaper models are
one line away — Sonnet 5.5 is $2/$10 per MTok and Haiku 5.5 $0.10/$0.50, against
Opus 5.5 at $4/$20 — and parsing and bulk scoring are the obvious candidates to
move down. That is a quality trade, so make it on what `ai_usage` shows rather
than inheriting it as a default.

Spend is capped per user by `QUOTA_MONTHLY_USD` and `QUOTA_HOURLY_CALLS`, checked
before every model call and counting failed calls too. Without them one account
can run your key to any amount. The profile page shows each user their own usage.

## Design notes

- **Prompts are ported verbatim** from the artifact (`src/lib/ai/prompts.ts`). They
  encode the product's promises — never invent, keep 85–95% of the original wording,
  put anything unsupported in `gaps`. Change them deliberately.
- **Scoring is ours, not the model's** (`src/lib/score.ts`). The model estimates
  per-requirement support; the weights (required 40, preferred 15, keywords 15,
  seniority 15, domain 10, logistics 5) are applied here.
- **Job descriptions are untrusted.** They are third-party text that may contain
  instructions aimed at an AI. The prompt says so explicitly, and `INJECT` in
  `src/lib/resume.ts` flags postings that look like they are trying.
- **The API key is server-only.** `src/lib/ai/client.ts` imports `server-only`, so a
  stray client import fails the build rather than leaking the key.
