# Smart Edu

**Smarter management. Better insights. Personalised education.**

An AI-powered school and college management platform that connects students,
parents, teachers and administrators around one academic record — with an AI
assistant per role that respects exactly who is permitted to see what.

This is a full-stack application, not a UI prototype: React frontend, Express
API, PostgreSQL database, JWT authentication, role-based authorization and live
analytics computed from real data.

---

## Table of contents

1. [Overview](#1-overview)
2. [Features](#2-features)
3. [Architecture](#3-architecture)
4. [Tech stack](#4-tech-stack)
5. [Folder structure](#5-folder-structure)
6. [PostgreSQL setup](#6-postgresql-setup)
7. [Environment variables](#7-environment-variables)
8. [Installation](#8-installation)
9. [Database migration](#9-database-migration)
10. [Seeding demo data](#10-seeding-demo-data)
11. [Development commands](#11-development-commands)
12. [Demo credentials](#12-demo-credentials)
13. [API overview](#13-api-overview)
14. [Authentication architecture](#14-authentication-architecture)
15. [Authorization and privacy](#15-authorization-and-privacy)
16. [AI configuration](#16-ai-configuration)
17. [Testing](#17-testing)
18. [Deployment](#18-deployment)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. Overview

Academic data usually lives in six places and reaches nobody in time. Attendance
sits in a register, marks in a spreadsheet, assignments in a messaging group. By
the time a pattern is obvious — a student slipping below the attendance
threshold, results declining across a term — the window to act has closed.

Smart Edu puts every mark, register and submission into one PostgreSQL database
and computes the dashboards directly from it. A low-attendance flag appears the
moment it becomes true, to the people who can act on it.

The design decision that shapes everything else: **students control what their
parents can see.** Not the institution, not the parent — the student, category
by category. That constraint runs all the way down to the AI layer, where the
authorization check happens *before* any data reaches a model.

---

## 2. Features

### Students
- Dashboard with attendance, CGPA, pending assignments and upcoming exams
- Subject-wise attendance with monthly trends and 75% threshold warnings
- Marks, grades, credit-weighted CGPA and class rank
- Assignment submission with file upload, deadlines and teacher feedback
- Timetable, exam schedule and a combined calendar
- Progress page with charts and generated insights
- AI tutor grounded in their own academic record
- Study plan generator built from their weakest subjects
- Complaints (with real anonymity) and leave applications
- **Privacy centre** — per-category, per-parent visibility controls

### Parents
- Dashboard per child, with a child selector for multiple children
- Attendance, marks, assignments and performance — subject to what the student shares
- Honest "not shared" states rather than misleading zeros
- Fee records and payment
- Parent-teacher meeting booking, rescheduling and cancellation
- AI assistant that explains progress in plain language

### Teachers
- Dashboard with class health, low attendance and declining performance
- Fast attendance marking (default present, flag exceptions, bulk actions)
- Spreadsheet-style marks entry with keyboard navigation and a publish step
- Assignment creation, submission tracking and grading with feedback
- **AI quiz, assignment and question paper generators** with answer keys
- **Natural-language student search** ("show students below 75% attendance")
- Class and workload reports

### Administrators
- Institutional dashboard: attendance, performance, risk distribution
- Full user management with role provisioning and password resets
- Classes, subjects, departments and teaching assignments
- Timetable builder with automatic conflict detection
- Complaint triage, fee administration, leave oversight
- Granular permissions with per-user overrides
- Complete audit trail of every sensitive action
- Institution-wide analytics and reports

---

## 3. Architecture

```
React (Vite)
   ↓  axios, in-memory access token
Express API
   ↓  authenticateToken  — verifies JWT, re-reads role from the database
   ↓  requireRole / requirePermission  — RBAC
   ↓  accessService  — ownership and privacy scoping
Controller
   ↓
Service  — domain logic, transactions
   ↓
PostgreSQL  — the single source of truth
   ↓
Response  →  React dashboard
```

Three principles hold throughout:

**The backend never trusts the frontend.** The role attached to a request is
re-read from the database on every call, so a token minted before a demotion
cannot outlive it. Route guards in React are a usability layer only.

**One authorization module.** `server/src/services/accessService.js` is the
single authority on "may this user see that student's data?". Controllers and
AI agents both resolve through it, so the AI can never see more than the REST
API would hand the same user.

**No AI-generated SQL is ever executed.** Natural-language search parses a
phrase into one of a fixed set of intents, which map to hand-written,
parameterised queries. An unrecognised phrase returns "I couldn't interpret
that" — the failure mode is a useless answer, never an unsafe one.

---

## 4. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 6, React Router 6, Tailwind CSS 3 |
| Charts | Recharts |
| Icons | Lucide React |
| Forms | React Hook Form |
| State | React Context (auth, theme, toasts) |
| Backend | Node.js, Express 4 |
| Database | PostgreSQL 13+ via `pg` |
| Auth | JWT (access + rotating refresh), bcryptjs |
| Validation | Zod |
| Security | Helmet, CORS, express-rate-limit |
| Testing | Vitest, Supertest |

---

## 5. Folder structure

```
smart-edu/
├── client/
│   └── src/
│       ├── auth/            Login, register, password reset, route guards
│       ├── charts/          Recharts wrappers
│       ├── components/
│       │   ├── ui/          Button, Card, DataTable, Modal, states…
│       │   └── AIChat.jsx   Shared chat interface
│       ├── context/         Auth, theme, toast providers
│       ├── dashboards/
│       │   ├── student/     Student pages
│       │   ├── parent/      Parent pages
│       │   ├── teacher/     Teacher pages
│       │   └── admin/       Admin pages
│       ├── hooks/           useApi, useDebounced, useClickOutside…
│       ├── layouts/         DashboardLayout, Sidebar, Navbar, navigation
│       ├── pages/           Shared pages (timetable, reports, profile…)
│       ├── services/        api.js (axios client), endpoints.js
│       └── utils/           format, constants, cn
│
├── server/
│   ├── src/
│   │   ├── ai/              aiService, agents, ragService, generators,
│   │   │                    contextService, queryTranslator
│   │   ├── config/          env.js
│   │   ├── controllers/     One per domain
│   │   ├── db/              pool, migrate, seed helpers, reset
│   │   ├── middleware/      auth, validate, errorHandler, rateLimit, upload
│   │   ├── routes/          One router per domain + index
│   │   ├── services/        accessService, analytics, attendance, marks…
│   │   ├── utils/           ApiError, response, tokens, grades, audit
│   │   ├── validators/      Zod schemas
│   │   ├── app.js           Express app (exported for tests)
│   │   └── server.js        Entry point
│   └── tests/               Vitest integration suite
│
├── database/
│   ├── schema.sql           Full DDL — the source of truth
│   ├── seed.sql             Permissions, role defaults, settings
│   ├── seed.js              Demo data generator
│   └── migrations/          Incremental changes
│
├── docs/API.md              Endpoint reference
├── .env.example
└── package.json             npm workspaces root
```

---

## 6. PostgreSQL setup

You need PostgreSQL 13 or newer running locally.

**Windows** — install from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/).
Remember the password you set for the `postgres` user; you will need it in `.env`.

**macOS**

```bash
brew install postgresql@16
brew services start postgresql@16
```

**Linux**

```bash
sudo apt install postgresql
sudo systemctl start postgresql
```

**Docker** — if you would rather not install anything:

```bash
docker run --name smart-edu-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

You do **not** need to create the database by hand — `npm run db:setup` does it.

---

## 7. Environment variables

Copy the example file and fill it in:

```bash
cp .env.example .env
```

The variables that matter to get started:

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Full connection string (wins over the discrete parts) | — |
| `PGHOST` / `PGPORT` | Database host and port | `localhost` / `5432` |
| `PGUSER` / `PGPASSWORD` | Database credentials | `postgres` / `postgres` |
| `PGDATABASE` | Database name | `smart_edu` |
| `JWT_SECRET` | Access token secret | dev fallback |
| `JWT_REFRESH_SECRET` | Refresh token secret | dev fallback |
| `PORT` | API port | `5000` |
| `CLIENT_URL` | Allowed CORS origin | `http://localhost:5173` |
| `AI_PROVIDER` | `mock`, `openai` or `anthropic` | `mock` |
| `AI_API_KEY` | Key for the chosen provider | — |
| `SEED_DEMO_PASSWORD` | Password for seeded demo accounts | `Demo@12345` |

Development runs on fallback JWT secrets so `npm run dev` works immediately.
**Production refuses to start on them** — set real ones:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 8. Installation

```bash
# 1. Install everything (npm workspaces — one command covers client and server)
npm install

# 2. Configure
cp .env.example .env
#    …then set PGPASSWORD (or DATABASE_URL) to match your PostgreSQL install

# 3. Create the database and apply the schema
npm run db:setup

# 4. Load realistic demo data
npm run db:seed

# 5. Start both the API and the client
npm run dev
```

Then open **http://localhost:5173** and sign in with a demo account.

---

## 9. Database migration

```bash
npm run db:setup     # create the database (if missing) + migrate
npm run db:migrate   # apply the schema and any pending migrations
npm run db:reset     # drop everything and rebuild (development only)
```

The migration runner applies, in order:

1. `database/schema.sql` — recorded as `000_schema.sql`
2. `database/seed.sql` — permissions, role defaults, settings
3. every `*.sql` in `database/migrations/`, sorted by filename

Each file is applied in a transaction and recorded in `schema_migrations` with a
checksum, so re-running is safe. Once a database is live, add changes as new
numbered files in `database/migrations/` rather than editing `schema.sql`.

---

## 10. Seeding demo data

```bash
npm run db:seed
```

This generates a complete institution:

- 1 administrator, 5 teachers, 10 parents, 30 students
- 4 departments, 3 classes, 10 subjects, full teaching assignments
- A conflict-free weekly timetable
- ~4,000 attendance records across 45 school days
- 72 assessments with marks (one deliberately left unpublished)
- Assignments in every state — pending, submitted, late, graded
- Notices, notifications, exams, fee records, PTM slots
- Complaints (including a genuinely anonymous one) and leave applications
- Study documents indexed for AI retrieval

Students are generated from stable archetypes — at-risk, struggling, improving,
top — so a student who is struggling is struggling *consistently* across
attendance, marks and submissions. The dashboards therefore show coherent
stories rather than noise.

Two students have privacy restrictions in place so the parent dashboard's
"not shared" states are visible without configuring anything.

Re-running the seed clears previous demo content first.

---

## 11. Development commands

**Root**

```bash
npm run dev          # API + client together
npm run build        # production client build
npm start            # production API (serves the built client)
npm test             # server test suite
npm run db:setup     # create database + migrate
npm run db:seed      # load demo data
npm run db:reset     # rebuild from scratch
```

**Client** (`cd client`)

```bash
npm run dev          # Vite dev server on :5173
npm run build        # build to client/dist
npm run preview      # preview the production build
npm run lint         # ESLint
```

**Server** (`cd server`)

```bash
npm run dev          # node --watch on :5000
npm start            # production
npm test             # Vitest
npm run test:watch   # Vitest in watch mode
```

---

## 12. Demo credentials

After `npm run db:seed`, these accounts exist:

| Role | E-mail | Password |
|---|---|---|
| Administrator | `admin@smartedu.demo` | `Demo@12345` |
| Teacher | `teacher@smartedu.demo` | `Demo@12345` |
| Student | `student@smartedu.demo` | `Demo@12345` |
| Parent | `parent@smartedu.demo` | `Demo@12345` |

> **Development only.** These are seeded credentials for local demonstration.
> Never deploy them. The login page offers them as one-click fills, clearly
> labelled as demo accounts.

The parent account is linked to **two children**, so the child selector is
exercised — and the second child has withheld marks and CGPA, so you can see
the privacy controls actually biting.

---

## 13. API overview

All endpoints are under `/api`. Full reference in [`docs/API.md`](docs/API.md).

```
/api/auth          register, login, logout, refresh, me, password reset
/api/users         admin user management, parent↔student links
/api/students      student records, profiles, remarks
/api/parents       children, dashboard, per-child sections
/api/teachers      directory, own classes, own students
/api/departments   CRUD
/api/classes       CRUD, enrollment
/api/subjects      CRUD, teaching assignments
/api/attendance    registers, summaries, low-attendance detection
/api/marks         assessments, marks entry, publishing, performance
/api/assignments   CRUD, submissions
/api/submissions   grading
/api/timetable     weekly schedule, today, conflict audit
/api/exams         exam schedule
/api/notices       announcements
/api/notifications notification centre
/api/complaints    submission, tracking, triage
/api/leave         applications and review
/api/fees          structures, records
/api/payments      order creation and verification
/api/ptm           slots and bookings
/api/privacy       student-owned parent visibility controls
/api/reports       student, class, teacher, institution
/api/analytics     role dashboards, attendance, academic, risk
/api/search        global search
/api/admin         permissions, settings, audit logs, system
/api/ai            chat, generators, natural-language search, RAG
```

**Response format**

```json
{ "success": true,  "data": {}, "message": "Operation successful" }
{ "success": false, "message": "Something went wrong", "errors": [] }
```

---

## 14. Authentication architecture

```
Login
  ↓  POST /api/auth/login
Access token (15m, in memory) + refresh token (7d, httpOnly cookie)
  ↓  GET /api/auth/me
User + profile + effective permissions
  ↓
Redirect to the role's dashboard
```

- Passwords are hashed with **bcrypt at 12 rounds**. Nothing is ever stored in
  readable form, and no response ever contains a hash.
- The **access token carries only `userId` and `role`** — nothing that could go
  stale or leak.
- **Refresh tokens are stored as SHA-256 hashes**, so a database leak cannot be
  replayed against the API.
- Refresh tokens **rotate on use**. Replaying a revoked one is treated as theft
  and drops every session for that user.
- Changing a password, or an admin resetting one, **revokes every session**.
- Login answers identically for a wrong password and an unknown e-mail, and
  burns the same bcrypt time either way — so timing cannot enumerate accounts.

---

## 15. Authorization and privacy

Every protected endpoint passes through:

1. `authenticateToken` — verifies the JWT and re-reads the user from the database
2. `requireRole` / `requireAnyRole` — role gate
3. `requirePermission` — granular permission check
4. `accessService` — ownership and privacy scoping

**Who can see a student's data**

| Requester | Access |
|---|---|
| Admin | Everything |
| Student | Their own record only |
| Teacher | Students in classes they are assigned to |
| Parent | Linked children, **only** the categories that child shares |

**The privacy model.** A student has a master switch plus six per-parent
category flags: attendance, marks, CGPA, assignments, reports, fees. A parent
sees a category only when the master switch is on *and* that flag is set. Only
the student can change them — an admin cannot, and the tests assert this.

When a category is withheld, the API does not fetch that data at all. There is
nothing to leak, and the parent UI says "not shared" rather than showing a zero
that reads as "no attendance recorded".

---

## 16. AI configuration

Smart Edu **works fully with no API key.** The default `AI_PROVIDER=mock` runs
a built-in assistant that composes answers from the same authorised database
context a real provider would receive — so demo answers are actually true rather
than plausible-sounding filler.

```env
AI_PROVIDER=mock          # default — no key needed
# AI_PROVIDER=openai
# AI_API_KEY=sk-...
# AI_MODEL=gpt-4o-mini

# AI_PROVIDER=anthropic
# AI_API_KEY=sk-ant-...
# AI_MODEL=claude-sonnet-4-5
```

If a provider is configured but the key is missing, or the provider call fails,
the request **degrades to the built-in assistant** rather than showing an error.

**Agents** — `server/src/ai/`

| Agent | Scope |
|---|---|
| `studentAgent` | Tutor, doubt solving, study plans, weak-topic analysis |
| `parentAgent` | Performance explanation, improvement suggestions |
| `teacherAgent` | Class analysis, at-risk identification |
| `adminAgent` | Institutional analytics and resource planning |
| `analyticsAgent` | Deterministic narrative insights (no model involved) |

**RAG** — `ragService.js` is provider-pluggable. The application only calls
`embed()` and `search()`, so swapping FAISS for Chroma or Pinecone means adding
one provider entry — no schema change, no call-site change. With
`VECTOR_PROVIDER=mock` retrieval uses PostgreSQL full-text search over the same
chunks, which is genuinely useful rather than a stub.

**Natural-language search** deserves its own note. AI-generated SQL is never
executed — not sanitised, not validated, never executed. A phrase is parsed into
one of a closed set of intents with numeric arguments, and those map to
hand-written parameterised queries in `queryTranslator.js`.

---

## 17. Testing

```bash
npm test
```

The suite runs against a **real PostgreSQL database** — mocking it would test
the mock, not the authorization rules and constraints that are the point. Point
it at a scratch database:

```bash
PGDATABASE=smart_edu_test npm test
```

Coverage:

- **Authentication** — registration, login, bcrypt hashing, JWT validation,
  refresh rotation, password reset, account enumeration resistance
- **Authorization** — role gates, ownership checks (changing the id in the URL),
  teacher class scoping, parent privacy enforcement, AI boundary
- **Attendance** — marking, duplicate prevention, percentage calculation,
  threshold detection, future-date rejection
- **Marks** — validation against maximum, publish gating, visibility, CGPA, rank
- **Assignments** — creation, submission, late flagging, grading, cross-class refusal
- **Timetable** — teacher and class conflict detection
- **Calculations** — grades, credit-weighted CGPA, risk scoring, trend detection

---

## 18. Deployment

**Build**

```bash
npm run build          # builds client/dist
NODE_ENV=production npm start
```

In production the API serves the built client and falls through to `index.html`
so client-side routing survives a hard refresh.

**Before deploying**

- [ ] Set real `JWT_SECRET` and `JWT_REFRESH_SECRET` (32+ chars, different)
- [ ] Set `NODE_ENV=production` — the server refuses to start on dev secrets
- [ ] Set `DATABASE_URL` and `PGSSL=true` for hosted Postgres
- [ ] Set `CLIENT_URL` to the real origin
- [ ] Run `npm run db:migrate` (not `db:seed` — that is demo data)
- [ ] Create a real administrator account and delete the demo accounts
- [ ] Serve over HTTPS — refresh cookies are `secure` in production

**Platform notes**

- *Render / Railway / Fly* — set the environment variables, build command
  `npm install && npm run build`, start command `npm start`
- *Vercel + separate API* — deploy `client/` to Vercel, point
  `VITE_API_TARGET` at the API host, and set `CLIENT_URL` on the API
- *Docker* — Node 18+ base image, expose `PORT`, provide `DATABASE_URL`

---

## 19. Troubleshooting

**`password authentication failed for user "postgres"`**
The password in `.env` does not match your PostgreSQL install. Update
`PGPASSWORD`, or set `DATABASE_URL` to a full connection string.

**`database "smart_edu" does not exist`**
Run `npm run db:setup` — it creates the database and applies the schema.

**`ECONNREFUSED` on startup**
PostgreSQL is not running. Start the service (`brew services start postgresql`,
`sudo systemctl start postgresql`, or start the Windows service).

**`relation "users" does not exist`**
The schema has not been applied. Run `npm run db:migrate`.

**Dashboards are empty after signing in**
The demo data has not been loaded. Run `npm run db:seed`.

**Client loads but every request fails**
The API is not running, or is on a different port. Check that `npm run dev`
started both, and that `PORT` matches the Vite proxy target.

**"AI provider not configured" behaviour**
This is expected and intentional. With `AI_PROVIDER=mock` the built-in
assistant answers from your real database records. Set `AI_PROVIDER` and
`AI_API_KEY` for full conversational replies.

---

## Licence

Built as a demonstration of a production-shaped academic management platform.
