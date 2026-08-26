# Smart Edu — Deployment Guide

This covers taking Smart Edu from `localhost` to a real, publicly reachable
deployment: a managed PostgreSQL database, the API server, and the built
client — plus the checklist to run through before anyone but you can log in.

Smart Edu ships as **one Node process that serves both the API and the built
React client** (see `server/src/app.js` — in production it serves
`client/dist` and falls through to `index.html` for client-side routing).
That means most of this guide is "deploy one Node service plus one Postgres
database," which fits comfortably on a single free-tier host.

---

## Table of contents

1. [Choosing a shape](#1-choosing-a-shape)
2. [Pre-deployment checklist](#2-pre-deployment-checklist)
3. [Database: managed PostgreSQL](#3-database-managed-postgresql)
4. [Walkthrough: Render (recommended for a first deploy)](#4-walkthrough-render-recommended-for-a-first-deploy)
5. [Alternative: Railway](#5-alternative-railway)
6. [Alternative: a VPS with Docker](#6-alternative-a-vps-with-docker)
7. [Alternative: split deployment (Vercel + separate API)](#7-alternative-split-deployment-vercel--separate-api)
8. [Environment variables reference](#8-environment-variables-reference)
9. [Running migrations in production](#9-running-migrations-in-production)
10. [Creating your first real admin account](#10-creating-your-first-real-admin-account)
11. [AI provider in production](#11-ai-provider-in-production)
12. [HTTPS, CORS and cookies](#12-https-cors-and-cookies)
13. [Post-deploy verification](#13-post-deploy-verification)
14. [Ongoing operations](#14-ongoing-operations)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Choosing a shape

| Shape | Good for | Effort |
|---|---|---|
| **One host, one process** (Render / Railway / Fly / a VPS) | Most deployments, including a jury demo or a small real institution | Low |
| **VPS + Docker** | Full control, self-hosting, no vendor lock-in | Medium |
| **Split** (static client on Vercel/Netlify + API elsewhere) | You specifically want a CDN-fronted client | Medium-high, and unnecessary for most cases |

Unless you have a specific reason to split them, **deploy the single combined
service** — it's simpler, and it's what the codebase is already shaped for.

---

## 2. Pre-deployment checklist

Do these before anyone else gets a URL:

- [ ] Generate real secrets — **do not reuse anything from your local `.env`**:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
  Run it twice for `JWT_SECRET` and `JWT_REFRESH_SECRET` — they must differ.
- [ ] `NODE_ENV=production` is set. The server **refuses to start** on the
  development fallback JWT secrets when this is set — that's intentional,
  not a bug to work around.
- [ ] A managed PostgreSQL database exists and you have its connection string.
- [ ] `CLIENT_URL` is set to the exact public origin (e.g.
  `https://smart-edu.onrender.com`) — CORS and the refresh-token cookie both
  depend on this matching exactly.
- [ ] You have **not** run `npm run db:seed` against this database, or if you
  did to look around, you've deleted the demo accounts before going live
  (see [§10](#10-creating-your-first-real-admin-account)).
- [ ] `.env` itself is never uploaded anywhere — only the *values* go into
  your host's environment variable settings.

---

## 3. Database: managed PostgreSQL

Any of these work; pick based on what else you're already using.

| Provider | Free tier | Notes |
|---|---|---|
| [Neon](https://neon.tech) | Yes, generous | Serverless Postgres, scales to zero, easiest to start with |
| [Supabase](https://supabase.com) | Yes | Postgres + extras you won't need here, but fine to use just for the DB |
| Railway Postgres | Trial credit, then paid | Convenient if you're also hosting the app on Railway |
| AWS RDS / Google Cloud SQL | No free tier | For when you outgrow the others |

Whichever you choose, you'll end up with a connection string like:

```
postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

Set that as `DATABASE_URL` and set `PGSSL=true` — hosted Postgres almost
always requires TLS, and the app's pool config (`server/src/db/pool.js`) only
adds `ssl: { rejectUnauthorized: false }` when `PGSSL=true` is set.

---

## 4. Walkthrough: Render (recommended for a first deploy)

Render has a genuine free tier for both a Postgres database and a web
service, and deploys straight from a GitHub repo with no Dockerfile needed.

**Step 1 — push your code to GitHub** (you've already done this).

**Step 2 — create the database**
1. Render dashboard → **New** → **PostgreSQL**
2. Name it, pick the free plan, create it
3. Once it's up, copy the **Internal Database URL** (if your web service will
   also be on Render) or the **External Database URL** (if not)

**Step 3 — create the web service**
1. Render dashboard → **New** → **Web Service** → connect your GitHub repo
2. Configure:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Node version:** 18 or newer (Render usually auto-detects from
     `package.json` engines)
3. Add environment variables (Render's **Environment** tab) — see the full
   list in [§8](#8-environment-variables-reference). At minimum:
   ```
   NODE_ENV=production
   DATABASE_URL=<the connection string from Step 2>
   PGSSL=true
   JWT_SECRET=<generated>
   JWT_REFRESH_SECRET=<generated>
   CLIENT_URL=https://<your-render-service-name>.onrender.com
   AI_PROVIDER=gemini
   AI_API_KEY=<your Gemini key>
   ```
4. Deploy. Render builds the client (`npm run build`) and starts the server
   (`npm start`), which serves the built client itself.

**Step 4 — run migrations**

Render's free web services don't give you a persistent shell, so run
migrations from your own machine, pointed at the production database:

```bash
DATABASE_URL="<the External Database URL>" PGSSL=true npm run db:migrate --workspace server
```

Do **not** run `db:seed` here — that's demo data, not for a real deployment.
See [§10](#10-creating-your-first-real-admin-account) for creating a real
first user instead.

**Step 5 — open the app** at the URL Render gives you, and confirm
`https://<your-app>/api/health` returns `"status": "ok"`.

---

## 5. Alternative: Railway

Very similar shape to Render, with one-click Postgres provisioning.

1. Railway dashboard → **New Project** → **Deploy from GitHub repo**
2. **New** → **Database** → **PostgreSQL** in the same project — Railway
   auto-injects `DATABASE_URL` into your service's environment when they're
   in the same project, so you often don't need to copy it manually
3. On your service, set **Build Command** `npm install && npm run build` and
   **Start Command** `npm start`
4. Add the remaining environment variables from [§8](#8-environment-variables-reference)
5. Railway gives you a shell via `railway run` — you can run migrations
   directly against the linked database:
   ```bash
   railway run npm run db:migrate --workspace server
   ```

---

## 6. Alternative: a VPS with Docker

For full control (a DigitalOcean droplet, an EC2 instance, your own hardware).

**`Dockerfile`** (add this to the repo root if you go this route):

```dockerfile
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
COPY client/package*.json client/
COPY server/package*.json server/
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 5000
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t smart-edu .
docker run -d --name smart-edu \
  --env-file .env.production \
  -p 5000:5000 \
  smart-edu
```

Put a reverse proxy (Caddy or nginx) in front of it for TLS termination —
Caddy is the least fuss:

```
# Caddyfile
smart-edu.example.com {
  reverse_proxy localhost:5000
}
```

Caddy handles the HTTPS certificate automatically. Point `CLIENT_URL` at
`https://smart-edu.example.com` and you're done.

Run the database as a separate managed service ([§3](#3-database-managed-postgresql))
rather than in a container on the same box — you don't want your data's
durability tied to the same disk as your app.

---

## 7. Alternative: split deployment (Vercel + separate API)

Only do this if you specifically want the client on a CDN. It adds
complexity for no benefit at this project's scale, but if you want it:

1. Deploy `server/` on its own (Render/Railway/Fly), following §4 or §5 but
   **skip building the client** — the API doesn't need it when the client is
   hosted separately.
2. Deploy `client/` to Vercel:
   - **Root directory:** `client`
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
   - Set `VITE_API_TARGET` if you're still relying on the dev proxy — in
     production, `client/src/services/api.js` calls `/api` on the same
     origin, so you'll instead need to either put both behind one domain via
     a proxy/rewrite, or change the axios `baseURL` to the full API URL.
3. On the API host, set `CLIENT_URL` to the Vercel URL so CORS allows it.

This is the one topology the codebase doesn't fully automate for you — the
combined single-service deployment (§4–§6) is the path of least resistance.

---

## 8. Environment variables reference

| Variable | Required | Production value |
|---|---|---|
| `NODE_ENV` | Yes | `production` |
| `PORT` | No | Usually injected by the host; defaults to `5000` |
| `DATABASE_URL` | Yes | Your managed Postgres connection string |
| `PGSSL` | Usually | `true` for any hosted Postgres |
| `JWT_SECRET` | Yes | Freshly generated, 32+ chars |
| `JWT_REFRESH_SECRET` | Yes | Freshly generated, different from the above |
| `CLIENT_URL` | Yes | The exact public origin, e.g. `https://smart-edu.onrender.com` |
| `AI_PROVIDER` | No | `gemini` (free), `openai`, `anthropic`, or leave as `mock` |
| `AI_API_KEY` | If using a live provider | From your provider's console |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | No | Leave empty to keep mock payment mode |
| `SEED_DEMO_PASSWORD` | No | Irrelevant in production — you shouldn't run `db:seed` there |

Everything else in `.env.example` has a sensible default and can be left
unset unless you need to change it.

---

## 9. Running migrations in production

```bash
DATABASE_URL="<production connection string>" PGSSL=true \
  npm run db:migrate --workspace server
```

This is safe to run repeatedly — `db:migrate` records what's already applied
in a `schema_migrations` table and skips it (see `database/migrations/README.md`).
When you add a feature later, drop the new migration file in
`database/migrations/` and re-run this same command; it only applies what's new.

**Never run `npm run db:reset` against a production database** — it drops
the entire schema. It's guarded to refuse when `NODE_ENV=production`, but
don't rely on that guard instead of just not typing the command.

---

## 10. Creating your first real admin account

`db:seed` is demo data — realistic, but fictional, and its accounts share one
public password. Don't run it against a real deployment. Instead, register
normally and promote yourself:

**1. Register** at `https://<your-app>/register` as a student or parent (the
only two self-serve roles) — this just gets you *an* account to promote.

**2. Promote it to admin directly in the database:**

```sql
-- Connect with `psql "<your DATABASE_URL>"` or your provider's SQL console.

UPDATE users SET role = 'admin' WHERE email = 'you@yourdomain.com';

INSERT INTO admin_profiles (user_id, employee_id, designation)
SELECT id, 'ADM001', 'Administrator' FROM users WHERE email = 'you@yourdomain.com';

-- The old student/parent profile row can stay or be removed; it's simply unused now.
```

**3. Sign out and back in** — the JWT only carries `userId` and role is
re-read from the database on every request (see `server/src/middleware/auth.js`),
so a fresh login picks up the new role immediately.

From the admin dashboard you can now create every other account (teachers,
students, parents) properly through **Users → New user**, which generates
individual temporary passwords rather than one shared demo password.

---

## 11. AI provider in production

Gemini's free tier is genuinely usable for a real small institution — this
integration is deliberately token-frugal (see `README.md` §16 for the
specifics: capped context, trimmed history, lean output budgets). If you
outgrow the free quota, either:

- Enable billing on the same Google Cloud project (same `AI_API_KEY`,
  same code, nothing to change), or
- Switch `AI_PROVIDER` to `openai` or `anthropic` — same environment
  variable, no code or schema change either way.

If you'd rather not manage an AI key at all in production, leave
`AI_PROVIDER=mock` — the built-in assistant still answers every question
correctly from real data, just without free-form conversational range.

---

## 12. HTTPS, CORS and cookies

- **HTTPS is not optional.** The refresh-token cookie is marked `secure` in
  production (`server/src/controllers/authController.js`), meaning browsers
  will silently refuse to send it over plain HTTP — login will appear to
  work but refresh/logout won't. Render, Railway and Vercel all give you
  HTTPS by default; on a VPS, use Caddy or nginx with Let's Encrypt.
- **`CLIENT_URL` must match exactly** — protocol, host, and no trailing
  slash. This is what the CORS allow-list in `server/src/app.js` checks
  against.
- If you put the app behind a CDN or extra proxy layer, make sure it forwards
  the `Cookie` and `Authorization` headers — some default CDN configs strip
  cookies on cached routes.

---

## 13. Post-deploy verification

Run through this once the app is live:

```bash
curl https://<your-app>/api/health
```
Expect `"status": "ok"` and `"database": { "connected": true }`.

Then in the browser:
- [ ] `/register` creates an account and redirects to the right dashboard
- [ ] `/login` works, and refreshing the page keeps you signed in
- [ ] Sign out, then try navigating directly to `/admin/dashboard` while
  signed out — you should land on `/login`, not see a flash of admin content
- [ ] As your promoted admin, create one teacher and one student, link a
  class, and confirm attendance/marks entry works end to end
- [ ] Open the AI assistant and ask it something — confirm it answers (check
  the small provider badge; if it says "built-in assistant" when you
  expected Gemini, revisit `AI_API_KEY`)

---

## 14. Ongoing operations

- **Logs:** Render/Railway both give you a log stream in their dashboard.
  On a VPS, `docker logs -f smart-edu` or your process manager's log command.
- **Backups:** your managed Postgres provider almost certainly has automatic
  backups — check the retention window and make sure it's enough for your
  needs (Neon and Supabase both do daily backups on paid tiers; free tiers
  vary, so check before you rely on it).
- **Zero-downtime deploys:** Render and Railway both do this automatically
  (new instance up, health-checked, old one drained). On a VPS, run two
  containers behind your reverse proxy and swap, or accept a few seconds of
  downtime on redeploy for a low-traffic app — not worth the complexity
  otherwise.
- **Scaling:** the API is stateless (sessions live in the database via
  refresh tokens, not in server memory), so horizontal scaling is just
  "run more instances behind a load balancer" with no code changes needed.

---

## 15. Troubleshooting

**Server won't start: "Refusing to start in production with an insecure configuration"**
`NODE_ENV=production` is set but `JWT_SECRET`/`JWT_REFRESH_SECRET` are
missing, too short, or identical. This is the safety check in
`server/src/config/env.js` working as intended — set real secrets.

**Login works but refresh/logout silently fail**
Almost always HTTPS or `CLIENT_URL` mismatch — the refresh cookie is
`secure` and scoped to `/api/auth`, so it needs an exact-match HTTPS origin.

**"CORS policy" errors in the browser console**
`CLIENT_URL` on the server doesn't match the origin the browser is actually
loading from. Check for a trailing slash or `http` vs `https` mismatch.

**AI replies always say "built-in assistant" even with a key set**
Check the server's startup log line — it prints the active AI provider on
boot. If it says `mock`, the environment variable didn't reach the process
(common cause: set it in the wrong environment tab, or forgot to redeploy
after adding it).

**Database connection refused / timeout**
Check `PGSSL=true` is set for hosted Postgres, and that your host's outbound
network isn't blocking the database's port (rare, but some restrictive VPS
firewalls need an explicit egress rule).
