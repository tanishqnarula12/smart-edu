# Smart Edu — Easiest Deploy (Vercel + Render + Supabase)

This is the fastest path to a live, public URL, using three free-tier
services:

| Piece | Host | What it does |
|---|---|---|
| Database | **Supabase** | Managed PostgreSQL |
| API | **Render** | Runs the Express server |
| Client | **Vercel** | Serves the built React app on a CDN |

You'll end up with two URLs (e.g. `smart-edu.vercel.app` and
`smart-edu-api.onrender.com`) talking to each other. That's normal for this
shape — just follow the steps in order, since a few settings on each service
depend on a URL from the step before it.

No terminal commands needed except one, later, to run database migrations.

---

## Before you start

Push your latest code to GitHub (you've already done this). Have these two
things ready:

- Two random secrets for JWT signing:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
  Run it twice — you need two *different* values.
- Your Gemini API key (optional — leave AI on `mock` if you'd rather skip this).

---

## Step 1 — Database on Supabase

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick any
   name/region, set a database password (save it), and create it.
2. Once it's ready, go to **Connect** (top of the project page) and copy the
   **Session pooler** connection string — it looks like:
   ```
   postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-xx-xxxx-x.pooler.supabase.com:5432/postgres
   ```
   **Use the Session pooler string, not "Direct connection."** Render's
   network is IPv4-only, and Supabase's direct connection is IPv6-only on
   free projects — the pooler is the one that actually connects.
3. Paste in your real database password where it says `[YOUR-PASSWORD]`.
   Save this whole string somewhere — it's your `DATABASE_URL` for Step 3.

---

## Step 2 — API on Render

1. Go to [render.com](https://render.com) → **New** → **Web Service** →
   connect your GitHub repo.
2. Configure:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
3. Add these environment variables (Render's **Environment** tab):
   ```
   NODE_ENV=production
   DATABASE_URL=<the Supabase Session pooler string from Step 1>
   PGSSL=true
   JWT_SECRET=<first generated secret>
   JWT_REFRESH_SECRET=<second generated secret>
   CLIENT_URL=http://localhost:5173
   CROSS_SITE_COOKIES=true
   AI_PROVIDER=gemini
   AI_API_KEY=<your Gemini key>
   ```
   `CLIENT_URL` is a placeholder for now — you'll update it in Step 5 once
   Vercel gives you a real URL. `CROSS_SITE_COOKIES=true` is required here:
   the client and API are on two different domains in this shape, so the
   login cookie needs that flag to survive the cross-site request at all.
4. Click **Create Web Service**. Wait for the first deploy to finish, then
   copy the URL Render gives you (e.g. `https://smart-edu-api.onrender.com`)
   — you'll need it in Step 4.

> Free Render services spin down after 15 minutes of no traffic and take
> ~30–50 seconds to wake back up on the next request. That's fine for a demo
> or small real usage; upgrade the instance type later if that cold start
> becomes annoying.

---

## Step 3 — Run database migrations

Do this once, from your own machine, pointed at the Supabase database:

```bash
DATABASE_URL="<same Session pooler string from Step 1>" PGSSL=true npm run db:migrate --workspace server
```

Don't run `npm run db:seed` — that's demo data with one shared password, not
for a real deployment. Step 6 below covers creating your real first account.

---

## Step 4 — Client on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** →
   import the same GitHub repo.
2. Configure:
   - **Root Directory:** `client`
   - **Framework Preset:** Vite (Vercel usually detects this automatically)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Add one environment variable:
   ```
   VITE_API_URL=https://smart-edu-api.onrender.com/api
   ```
   (use the actual Render URL from Step 2, with `/api` on the end).
4. Click **Deploy**. Once it's live, copy the URL Vercel gives you (e.g.
   `https://smart-edu.vercel.app`).

---

## Step 5 — Connect the two: update `CLIENT_URL`

Go back to Render → your web service → **Environment** → update:

```
CLIENT_URL=https://smart-edu.vercel.app
```

(use your real Vercel URL, no trailing slash). Save — Render redeploys
automatically. This is what tells the API's CORS check to actually trust
requests coming from your Vercel domain.

---

## Step 6 — Create your first real account

1. Visit your Vercel URL → **Register** as a student or parent (just to get
   *an* account to promote).
2. Open Supabase → **SQL Editor** → run:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'you@yourdomain.com';

   INSERT INTO admin_profiles (user_id, employee_id, designation)
   SELECT id, 'ADM001', 'Administrator' FROM users WHERE email = 'you@yourdomain.com';
   ```
3. Sign out and back in on the site — you're now an admin, and can create
   every other account properly from the admin dashboard.

---

## Verify it's all working

- [ ] `https://<your-render-url>/api/health` returns `"status": "ok"`
- [ ] Vercel URL loads the app, `/register` and `/login` both work
- [ ] Refresh the page after logging in — you should stay logged in (this is
  the one that fails if `CROSS_SITE_COOKIES` or `CLIENT_URL` is wrong)
- [ ] Log in, then sign out, then try visiting `/admin/dashboard` directly —
  you should be bounced to `/login`
- [ ] Open the AI assistant and ask something — the reply should not say
  "built-in assistant" if you set a real `AI_API_KEY`

---

## If something's not working

**Stuck on login / refresh logs you out**
Almost always `CLIENT_URL` on Render doesn't exactly match your Vercel URL
(check `https` vs no trailing slash), or `CROSS_SITE_COOKIES=true` didn't
get set before the last deploy.

**"CORS policy" error in the browser console**
Same cause as above — `CLIENT_URL` on Render must be the *exact* Vercel
origin the browser is loading from.

**Database connection times out**
You're likely using the "Direct connection" string instead of "Session
pooler" — go back to Supabase → Connect and copy the pooler one.

**First request after a while is very slow**
That's Render's free-tier cold start (see the note in Step 2), not a bug.

**Vercel preview deployments (branch URLs) can't log in**
Expected — `CLIENT_URL` on Render only trusts one origin, your production
Vercel URL. Preview URLs are a different origin, so they can't authenticate
against this API. Not worth solving unless you specifically need preview
deploys to work.
