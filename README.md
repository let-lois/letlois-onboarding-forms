[README.md](https://github.com/user-attachments/files/31868089/README.md)
# LetLois Onboarding

Client onboarding forms, built to grow into a full set: 3 plans × 5 parts each.
Each part is its own page and its own form — no multi-plan logic lives in one
mega-form. Submissions are written to a Cloudflare D1 database.

Currently built: **Ads plan → Part 1 (A2P / SMS Compliance)**, at
`public/ads/a2p/index.html`.

## How it's organized

```
public/
  shared/
    onboarding.css          # design system used by every form
    onboarding-engine.js    # rendering/validation/submit logic used by every form
  ads/
    a2p/index.html          # Part 1 of the Ads plan — just a question list + CONFIG
functions/
  api/
    submit-a2p.js           # receives Part 1 submissions, writes to D1
schema/
  0001_a2p_submissions.sql  # D1 table for Part 1
wrangler.toml
```

To add Part 2 (or a second plan), copy the `ads/a2p/` folder, change the
`steps` array and `apiEndpoint`, add a matching `functions/api/submit-XXX.js`,
and a new `schema/000N_xxx.sql` migration. The shared engine handles the UI —
you're just describing questions.

### Step types available in the engine

`text`, `email`, `tel`, `textarea`, `select`, `multiselect`, `address`,
`file`, `consent`, `checklist-detail`, `repeater`, `welcome`, `end`. Part 1
doesn't currently use `file`/`multiselect`/`checklist-detail`, but they're
there for future parts.

Every question step can also take an optional `context` string — rendered
as a collapsed "Why we ask" disclosure, closed by default.

## One-time setup

### 1. Install Wrangler and log in

```bash
npm install -g wrangler
wrangler login
```

### 2. Create the D1 database

```bash
wrangler d1 create letlois-onboarding
```

Copy the `database_id` it prints into `wrangler.toml`.

### 3. Run the migration

```bash
wrangler d1 execute letlois-onboarding --file=schema/0001_a2p_submissions.sql --remote
```

(Drop `--remote` to also test locally with `--local`.)

### 4. Push to GitHub

```bash
git init
git add -A
git commit -m "Initial commit: Ads plan, Part 1 (A2P)"
gh repo create letlois-onboarding --private --source=. --push
```

(No GitHub CLI? Create an empty repo on github.com, then
`git remote add origin <your-repo-url>` and `git push -u origin main`.)

### 5. Connect the repo to Cloudflare Pages

In the Cloudflare dashboard → Workers & Pages → Create → Pages → connect the
GitHub repo. Set the build output directory to `public`. Add the D1 binding
under Settings → Bindings if it wasn't picked up automatically from
`wrangler.toml`. Every push to `main` redeploys automatically.

### 6. Point the domain

Attach `start.letlois.com` to the Pages project under Custom Domains, so
Part 1 lives at `https://start.letlois.com/ads/a2p/`.

## Local preview

Opening `public/ads/a2p/index.html` directly in a browser runs the form in
**demo mode** — it looks and behaves exactly like production, but instead of
calling the API it just logs the submission to the console.

To test the real submit flow locally (Function + D1 together):

```bash
wrangler pages dev public --d1 DB=letlois-onboarding
```

## Open items

- **Theme**: currently the placeholder ink/parchment/brass/stamp system from
  the first draft. Pending: a screenshot or description of demo.letlois.com,
  plus the logo files, to reskin `public/shared/onboarding.css` to match.
- **Logo placement**: not yet added — waiting on the actual files. Should be
  small and unobtrusive per direction (a corner mark, not a header banner).
- **start.letlois.com landing/video page**: not yet built. Once the
  walkthrough video exists, a simple landing page can sit at the domain root
  with the video and links into each part, using the same design system.
- The consent text in `public/ads/a2p/index.html` links out to
  `letlois.com/terms-of-use`, `/cookie-policy`, and `/privacy-policy` —
  worth confirming those pages are live before this goes out to real clients.
- No admin view yet for browsing submissions — for now, query D1 directly:
  `wrangler d1 execute letlois-onboarding --command="SELECT * FROM a2p_submissions" --remote`
