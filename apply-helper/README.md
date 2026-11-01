# SoleilRise Assisted Apply

Fills a job application with your tailored resume and profile answers, then hands it to you. **It never clicks Submit.**

## Set up once (about 2 minutes)

```bash
git clone <this repo> ~/soleilrise && cd ~/soleilrise/apply-helper
bash setup_mac.sh
cp profile.example.yaml profile.yaml
open -e profile.yaml        # fill in your answers once
```

In `profile.yaml`, decide one line yourself: `sanctioned_country_ties`. Databricks, NVIDIA and other companies ask an export-control question about Cuba, Iran, North Korea, Syria and Crimea. Set it to `false` only if none of those apply to you. While it stays `null`, the question is outlined in red for you to answer each time.

## Each application

1. In SoleilRise → Resume Studio → **Your resume is ready**, click **Download PDF**.
2. Open **Fill the application for me** and click **Copy**.
3. Paste it into Terminal:

```bash
~/soleilrise/apply-helper/apply 'https://www.databricks.com/company/careers/...?gh_jid=8549046002' --resume ~/Downloads/Databricks_..._Resume_20261027.pdf
```

A Chrome window opens on the real application form. The tool:

- uploads the resume
- fills your name, email, phone, country, LinkedIn and "how did you hear"
- answers work authorization, sponsorship and citizenship status from your `profile.yaml`
- answers **No** to "worked here before", unless the company is on your resume. Then it leaves the question for you.
- sets EEO / voluntary self-ID to **Decline to self-identify**
- outlines in red anything it isn't sure of: essays, salary, consent boxes and unknown questions. It lists them in the Terminal too.
- never overwrites anything you already typed

Next, check every field, answer the red ones and click **Submit** yourself. Then type `d` in the Terminal. That logs the application to `~/.soleilrise/applications.csv`. Finally, tick **I submitted my application** in SoleilRise.

For multi-page forms such as Workday, sign in yourself and go to the next page. Then press **Enter** in the Terminal and it fills that page.

## Works with

| ATS | Status |
|---|---|
| Greenhouse, including company sites with `?gh_jid=` (Databricks, Anthropic, Stripe…) | Full: opens the form directly |
| Lever (`jobs.lever.co`) | Full |
| Ashby (`jobs.ashbyhq.com`) | Full |
| Workday, iCIMS, others | Best effort: you sign in, it fills each page when you press Enter |

## What it will never do

- Store or type passwords, or create accounts
- Solve CAPTCHAs or get around bot checks. If one appears, you solve it.
- Click Submit, or accept terms and consent boxes
- Guess an answer that isn't in `profile.yaml`

Your browser sign-ins stay in `~/.soleilrise/browser` on your Mac. Nothing is sent anywhere except the employer's own form when you submit.

If a Greenhouse company site doesn't open the form, add `--board <company>`, for example `--board databricks`.
