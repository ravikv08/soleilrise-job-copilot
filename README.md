# SoleilRise Job Copilot

An AI job-search copilot that finds fresh US roles, tailors your resume truthfully toward each posting, and tracks applications through interviews.

**Flow:** Profile → Find → Tailor → Apply → Interview → Outcome

## What's here

| Folder | What it is |
|---|---|
| `app/index.html` | The whole app: one page that runs as a **Claude artifact** on claude.ai |
| `apply-helper/` | Optional Mac tool that fills Greenhouse, Lever and Ashby application forms with your tailored resume. It **never clicks Submit** |

## Running the app

The app runs inside Claude only. It uses Claude's sign-in, per-user storage, AI calls and browser access, so opening `index.html` directly in a browser won't work.

- **Use it:** open the shared artifact link and sign in with a Claude account. Each person's resume, jobs and applications are private to them.
- **Desktop app vs. web:** in the Claude desktop app you also get job search, automatic reading of job links, company search and interview research, all through Claude's built-in browser. On the web you paste job descriptions instead; tailoring, review, downloads and tracking all work.
- **Your own copy:** ask Claude to publish `app/index.html` as an artifact.

## Features

- **Find Jobs:** US postings from the last 24–48 hours from company job boards (Greenhouse, Lever, Ashby), Workday sites, freehire.me, Y Combinator startups and your LinkedIn job-alert emails. Duplicates are merged and each role is scored against your resume.
  - Filters: resume match (70+ by default), career tier, location, industry and company stage.
  - Company search, including Apple's careers site.
- **Resume Studio:** tailoring in 4 steps.
  - Uses only what your resume and confirmed facts support.
  - Includes a separate recruiter-style review that flags overstated or unsupported lines.
  - Downloads as DOCX or PDF, checked line by line against what you approved.
- **Eligibility check:** flags postings that need citizenship or a security clearance, based on the work authorization you enter.
- **Connections:** 3 LinkedIn searches built from each posting: the hiring team, the recruiter for the team, and warm intros or referrals.
- **Interview prep:** searches public interview reports and predicts questions, each scored for how likely it is and how ready you are (out of 10). You can practise answers and get a score with specific fixes.
- **My Applications:** status tracking, Gmail reply checks, and a "What's working" view by source and target role.

## Principles

- Never invents experience, tools, numbers or results.
- Never submits an application for you.
- Never stores passwords. It never logs in to LinkedIn or scrapes it.
- EEO and self-identification questions default to "decline to answer".
