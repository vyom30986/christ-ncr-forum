# Christ NCR Forum



The complaint board for CHRIST (Deemed to be University), Delhi NCR. Post it, upvote it, watch the clock.

Mobile-first React + Vite PWA. Backend is Supabase (Google auth, Postgres with RLS, Realtime broadcasts, Edge Functions). AI moderation runs through Gemini inside an Edge Function, so the key never reaches the browser. Deployed on Vercel.

**Privacy model.** Students never receive an author id or email. The feed reads from the `public_complaints` SQL view, which exposes only the complaint fields plus the author's course and graduation year. Admins (emails in the `admins` table) see real names and emails, and every admin page load is written to `admin_views`.

## Layout

```
supabase/
  migrations/0001_init.sql     schema, enums, RLS, views, triggers, RPCs
  webhooks.sql                 trigger that calls notify-status on status changes
  functions/ai-review/         Gemini: category, clean title, name/abuse check, duplicates
  functions/notify-status/     Resend: email complainant + upvoters on status change
src/
  lib/        supabase client, types, labels, timers, API calls
  hooks/      auth, live clock, theme, realtime feed, toasts
  components/ cards, pills, sheets, nav, tetris blocks
  screens/    Login, Feed, Compose (+ AI preview), Detail, Mine, Admin
scripts/make-icons.mjs         generates the PWA icons (runs on prebuild)
```

## 1. Supabase

1. Create a project at supabase.com. Note the project ref, URL, anon key and service-role key.
2. **Schema.** Either `supabase link --project-ref <ref>` then `supabase db push`, or paste the files in `supabase/migrations/` into the SQL editor and run them in order (0001 through 0015).
3. **Owner and admins.** `vyomahuja30122009@gmail.com` is the permanent owner (`0005_admin_access.sql` seeds it, `0007_owner.sql` marks it as owner). The owner cannot be removed or demoted, even in SQL, and is the only account that can add or remove admins, from Admin → Access (only @christuniversity.in addresses). Admins added there have every other admin power. New admins get access on their next sign-in. To make someone else the owner, change the email in 0007 before running it.
4. **Google sign-in.** Authentication → Providers → Google: enable it, add your Google OAuth client id and secret (Google Cloud Console → Credentials → OAuth client, type Web; authorised redirect URI is `https://<ref>.supabase.co/auth/v1/callback`).
   Authentication → URL configuration: set Site URL to your Vercel URL and add `http://localhost:5173` to the redirect allow-list.
   The domain restriction is enforced in the database (`enforce_christncr_domain` trigger checks both the email suffix and Google's `hd` claim), so non-christncr accounts are rejected even if they get past Google's account chooser.
5. **Realtime.** Nothing to toggle: the app listens to a private broadcast topic (`feed`) that database triggers write to. The policy on `realtime.messages` in the migration grants read access to signed-in users.

## 2. Edge Functions

```bash
supabase secrets set GEMINI_API_KEY=... RESEND_API_KEY=... RESEND_FROM="Christ NCR Forum <cs@yourdomain.com>" APP_URL=https://your-app.vercel.app ESCALATION_EMAILS=pratham@christuniversity.in,facilities@christuniversity.in
supabase functions deploy ai-review
supabase functions deploy notify-status --no-verify-jwt
```

`ai-review` needs a Gemini key from Google AI Studio. It is called by the browser with the user's JWT, re-checks that the user is a `@christuniversity.in` account, reads the latest 50 open complaints with the service role, and returns `{ category, clean_title, contains_person_name, abusive, similar_ids }`. Optional: `GEMINI_MODEL` (default `gemini-3.8-flash`; Google retired 2.5 Flash for new users in 2026).

When Gemini answers 503 ("high demand") the function tries the other flash models the key can call (it lists them from the API once; override with `GEMINI_FALLBACK_MODELS=a,b`), then a second provider if `FALLBACK_LLM_KEY` is set: any OpenAI-compatible chat API, Groq by default (free tier, no card: https://console.groq.com/keys). Override with `FALLBACK_LLM_URL` / `FALLBACK_LLM_MODEL` (default `llama-3.3-70b-versatile`). The whole review is capped at 14 s; past that the student gets a plain preview with their own first sentence as the title, and the app offers "Post without AI" after 4 s regardless.

`notify-status` is called by the database, not by browsers. Wire it up by opening `supabase/webhooks.sql`, replacing the project ref and service-role key, and running it in the SQL editor (or create the same two webhooks in Dashboard → Database → Webhooks: tables `updates` and `escalations`, event INSERT, type Supabase Edge Function, with the `Authorization: Bearer <service-role-key>` header). Every status change or official reply then emails the complainant and all upvoters; every escalation emails the admins and `ESCALATION_EMAILS`.

## 3. Run locally

```bash
cp .env.example .env     # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev              # http://localhost:5173
```

`npm run build` typechecks, regenerates icons and produces `dist/`. `npm run preview` serves the production build (useful for testing the service worker and install prompt).

## 4. Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel. Framework preset: Vite. Build command `npm run build`, output `dist` (the defaults).
2. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. `vercel.json` already rewrites deep links to `index.html` and keeps `sw.js` uncached.
4. Add the Vercel URL to Supabase Authentication → URL configuration (Site URL + redirect list), and set `APP_URL` in the function secrets so emails link back correctly.

## How things work

- **Identity.** `name.surname@bbafth.christuniversity.in` is parsed on first login into name "Firstname Lastname", course "COURSE", grad year 2030. Other `@christuniversity.in` shapes fall back to the local part as the name.
- **Feed.** Category tabs, Top / New / Oldest-unresolved sort, a ticking timer per card (created → now, or → resolved_at). Changes arrive over Realtime and the list refetches.
- **Upvote / flag.** One each per user; votes toggle, flags carry a reason. A trigger hides a post at 3 flags; admins can restore it (clears flags) or remove it.
- **Compose.** Category, body (10–1000 chars), Private toggle (Safety is always private). Post sends the text to `ai-review`; the preview sheet shows the cleaned title (editable), blocks abuse, asks for a rewrite when a person is named, and lists similar open complaints with an upvote button so people pile on instead of duplicating.
- **Mine.** Status, live timer, delete any time, edit while upvotes = 0, reopen within 7 days of resolution (restarts the clock). Theme switch (Auto / Light / Dark) and sign-out live here.
- **Attention needed.** Any post with more than 50 upvotes is flagged automatically (a stored generated column, `0003_attention.sql`). It gets an Attention badge on its card, appears in the Attention tab of the feed, and in the Attention tab of the admin panel sorted by votes.
- **Check-ins and escalation.** When posting, the student picks how many working days to give (1 to 14, default 3; `0006_grace_days.sql`). After that many business days (weekends skipped), the author gets a pop-up: *Has this been solved?* Yes closes it as resolved. No asks *Has anyone promised to solve it in the next 1 to 7 days?* Yes with a number of days schedules the next check-in after that many days. No escalates: an `escalations` row is written, the webhook emails every admin plus the addresses in `ESCALATION_EMAILS` (the people in charge, e.g. Pratham), the complaint shows an Escalated badge in Admin, and the author is asked again 3 business days later. Admins resolving or rejecting stops the loop; reopening restarts it. Migration: `supabase/migrations/0002_checkins.sql`.
- **Admin → Users.** Every account ranked by complaints raised (switchable to most open, most upvoted, most escalated, votes cast, flags cast), with search. Each user has a full record page: profile, every complaint including private and hidden ones with all timestamps and check-in state, upvotes and flags they cast (with reasons), escalations, average time to resolution, and the audit log of which admin viewed their identity and when. Opening a record is itself logged. Migration `0004_admin_users.sql` adds the stats function and lets admins read votes.
- **Admin → Access.** The owner adds or removes admin emails from the app; other admins see the list read-only (`0005_admin_access.sql`, `0007_owner.sql`).
- **Admin.** All public complaints with names, status select (Rejected requires a note), official reply, flag queue with reasons, private tab for Safety/Harassment with a Contact-student mailto. Every load writes to `admin_views`.
- **PWA.** `vite-plugin-pwa` precaches the app shell only; Supabase REST/Auth/Realtime/Functions traffic is never cached. Installable on Android and iOS (Add to Home Screen) in standalone mode.

## Design

Screens follow the Claude Design file "Christ NCR Forum Complaint Board": Nunito (rounded), ink `#0A0A0A`, paper `#FFFFFF`, yellow `#FFD60A` for calls to action and upvotes, green `#2ECC71` resolved, blue `#3D7BFF` in progress, purple `#8B5CF6` acknowledged/private, pink `#FF5FA2` flagged/rejected, grey `#F2F2F2` cards, muted `#8A8A8A`. Dark mode swaps the surface tokens in `src/index.css`.

## Deploy to Cloudflare (alternative or in addition to Vercel)

**Pages (Git-connected):** Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → `<your-github-user>/<your-repo>`. Framework preset Vite, build command `npm run build`, output directory `dist`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build variables. `public/_redirects` handles deep links.

**Workers (CLI):** `npm run build` then `npx wrangler deploy` (uses `wrangler.jsonc`, serves `dist/` with SPA fallback).

Whichever host you use, add its URL to Supabase Authentication → URL configuration and to `APP_URL`.

## Email one-time code sign-in

Besides Google, students can sign in with a 6-digit code emailed to their @christuniversity.in address (Supabase `signInWithOtp` + `verifyOtp`, type `email`). Requirements in the Supabase dashboard:

1. Authentication → Providers → Email: enabled (it is by default). "Confirm email" can stay on; OTP sign-in verifies the address itself.
2. Authentication → Email Templates → Magic Link: the body must contain `{{ .Token }}` so the mail carries the code, e.g. `<p>Your Christ NCR Forum sign-in code is <b>{{ .Token }}</b>. It expires in 1 hour.</p>`.
3. Authentication → SMTP: Supabase's built-in mailer is for development only (a few emails per hour, project-wide). Before sharing with a cohort, add custom SMTP. Resend works with the free tier: host `smtp.resend.com`, port 465, user `resend`, password = your Resend API key, sender = a verified domain address.

The @christuniversity.in rule is enforced twice: in the app before sending, and by the `enforce_christncr_domain` trigger on `auth.users`.

Staff and other non-student @christuniversity.in addresses (anything that is not `first.last_courseYYYY@christuniversity.in`) cannot be parsed, so the first-visit screen asks for the name as a required field (migration 0013, `complete_onboarding(p_nationality, p_reporter_kind, p_name)`). Student names stay derived from the email and are not editable.
