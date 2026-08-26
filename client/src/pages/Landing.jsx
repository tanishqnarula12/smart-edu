import { Link } from 'react-router-dom';
import {
  GraduationCap, Users, School, ShieldCheck, Sparkles, BarChart3, CalendarCheck,
  ClipboardList, ArrowRight, Check, Brain, Lock, TrendingUp, Menu, X,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui/Button.jsx';
import { cn } from '../utils/cn.js';

/** Landing page (§71). */
export function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  const sections = [
    { href: '#features', label: 'Features' },
    { href: '#roles', label: 'For everyone' },
    { href: '#ai', label: 'AI' },
    { href: '#privacy', label: 'Privacy' },
  ];

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm">
              <GraduationCap size={19} aria-hidden="true" />
            </span>
            <span className="text-[15px] font-bold tracking-tight text-ink">Smart Edu</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Sections">
            {sections.map((section) => (
              <a
                key={section.href}
                href={section.href}
                className="text-sm font-medium text-ink-muted transition hover:text-ink"
              >
                {section.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Button to="/login" variant="ghost" size="sm">
              Sign in
            </Button>
            <Button to="/register" size="sm">
              Get started
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="rounded-lg p-2 text-ink-muted md:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-line bg-surface px-5 py-4 md:hidden">
            <nav className="flex flex-col gap-1" aria-label="Sections">
              {sections.map((section) => (
                <a
                  key={section.href}
                  href={section.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-muted transition hover:bg-surface-sunken"
                >
                  {section.label}
                </a>
              ))}
            </nav>
            <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
              <Button to="/login" variant="secondary" fullWidth>
                Sign in
              </Button>
              <Button to="/register" fullWidth>
                Get started
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[52rem] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-20 text-center sm:pt-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-900 dark:bg-brand-950/50 dark:text-brand-300">
            <Sparkles size={12} aria-hidden="true" />
            AI-powered academic management
          </span>

          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            Smarter management.
            <br />
            <span className="bg-gradient-to-r from-brand-600 to-violet-600 bg-clip-text text-transparent">
              Better insights. Personalised education.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-ink-muted">
            Smart Edu unifies attendance, marks, assignments and analytics into one place —
            with an AI assistant for every role that respects exactly who is allowed to see what.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button to="/register" size="lg" iconRight={ArrowRight}>
              Create an account
            </Button>
            <Button to="/login" variant="secondary" size="lg">
              Sign in to your dashboard
            </Button>
          </div>

          <dl className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { value: '4', label: 'Connected roles' },
              { value: '25+', label: 'API modules' },
              { value: '100%', label: 'Backend-enforced access' },
              { value: '0', label: 'Plaintext passwords' },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="text-2xl font-bold text-ink sm:text-3xl">{stat.value}</dt>
                <dd className="mt-1 text-xs text-ink-muted">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Problem / solution ─────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface-sunken py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
                The problem
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink">
                Academic data lives in six places and reaches nobody in time
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
                Attendance sits in a register, marks in a spreadsheet, assignments in a messaging
                group. By the time a pattern is obvious — a student slipping below the attendance
                threshold, results declining across a term — the window to act has usually closed.
              </p>

              <ul className="mt-6 space-y-3">
                {[
                  'Teachers spend evenings collating what the system already knows',
                  'Parents find out about a problem at the end of term',
                  'Students see a number, never the reason behind it',
                  'Administrators cannot answer simple institutional questions quickly',
                ].map((problem) => (
                  <li key={problem} className="flex gap-2.5 text-sm text-ink-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger-500" aria-hidden="true" />
                    {problem}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-line bg-surface-raised p-8 shadow-panel">
              <p className="text-sm font-semibold uppercase tracking-wide text-success-600">
                The solution
              </p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight text-ink">
                One record, four views, live analytics
              </h3>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
                Every mark, register and submission lands in one PostgreSQL database. The dashboards
                compute from it directly — so a low-attendance flag appears the moment it becomes
                true, to the people who can act on it.
              </p>

              <ul className="mt-6 space-y-3">
                {[
                  'Attendance below 75% flagged automatically, per subject',
                  'Declining performance detected across assessments, not guessed',
                  'An explainable academic risk indicator with its reasoning shown',
                  'Students decide what their parents see — not the institution',
                ].map((solution) => (
                  <li key={solution} className="flex gap-2.5 text-sm text-ink">
                    <Check size={16} className="mt-0.5 shrink-0 text-success-600" aria-hidden="true" />
                    {solution}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-ink">
              Everything an institution actually runs on
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
              Not a prototype — a working system with real persistence, real authorisation and real
              analytics behind every screen.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: CalendarCheck,
                title: 'Attendance',
                body: 'Subject-wise registers, monthly trends, automatic threshold warnings and duplicate-proof records.',
              },
              {
                icon: GraduationCap,
                title: 'Marks & CGPA',
                body: 'Spreadsheet-style entry, credit-weighted CGPA, class rank, and a deliberate publish step.',
              },
              {
                icon: ClipboardList,
                title: 'Assignments',
                body: 'Set work, collect submissions, flag late ones, grade with feedback — students notified throughout.',
              },
              {
                icon: BarChart3,
                title: 'Analytics',
                body: 'Attendance and performance analytics per student, class, subject and department, computed live.',
              },
              {
                icon: TrendingUp,
                title: 'Risk indicators',
                body: 'A transparent blend of attendance, results and coursework — always shown with its reasoning.',
              },
              {
                icon: ShieldCheck,
                title: 'Audit trail',
                body: 'Sign-ins, permission changes, marks and attendance edits — all recorded and searchable.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-line bg-surface-raised p-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
                  <feature.icon size={21} aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Roles ──────────────────────────────────────────────────────── */}
      <section id="roles" className="border-y border-line bg-surface-sunken py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-ink">Built for four people at once</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
              The same academic record, presented differently — and scoped strictly to what each
              person is allowed to see.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {[
              {
                icon: GraduationCap,
                role: 'Students',
                colour: 'from-brand-500 to-indigo-600',
                points: [
                  'Attendance, marks, CGPA and rank in one dashboard',
                  'An AI tutor that knows their actual record',
                  'Personalised study plans built from their weakest subjects',
                  'Full control over what their parents can see',
                ],
              },
              {
                icon: Users,
                role: 'Parents',
                colour: 'from-teal-500 to-emerald-600',
                points: [
                  'Progress for each linked child, with a child selector',
                  'Plain-language explanations of how they are doing',
                  'Parent-teacher meeting booking',
                  'Only ever what the student has chosen to share',
                ],
              },
              {
                icon: School,
                role: 'Teachers',
                colour: 'from-amber-500 to-orange-600',
                points: [
                  'Fast attendance marking and spreadsheet marks entry',
                  'Low attendance and declining performance surfaced automatically',
                  'AI quiz, assignment and question paper generation',
                  'Plain-English student search across their own classes',
                ],
              },
              {
                icon: BarChart3,
                role: 'Administrators',
                colour: 'from-violet-500 to-purple-600',
                points: [
                  'Institution-wide attendance and performance analytics',
                  'Full user, class, subject and timetable management',
                  'Granular permissions and a complete audit trail',
                  'Complaint triage, fee tracking and reporting',
                ],
              },
            ].map((entry) => (
              <div key={entry.role} className="rounded-2xl border border-line bg-surface-raised p-7 shadow-card">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white',
                      entry.colour
                    )}
                  >
                    <entry.icon size={21} aria-hidden="true" />
                  </span>
                  <h3 className="text-lg font-semibold text-ink">{entry.role}</h3>
                </div>

                <ul className="mt-5 space-y-2.5">
                  {entry.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-sm text-ink-muted">
                      <Check size={15} className="mt-0.5 shrink-0 text-success-600" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI ─────────────────────────────────────────────────────────── */}
      <section id="ai" className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-900 dark:bg-brand-950/50 dark:text-brand-300">
                <Brain size={12} aria-hidden="true" />
                AI intelligence
              </span>

              <h2 className="mt-5 text-3xl font-bold tracking-tight text-ink">
                An assistant per role — that cannot see past its permissions
              </h2>

              <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
                Every AI answer is built from data the asking user could already fetch through the
                API. A student cannot ask about a classmate. A parent cannot ask about something
                their child has withheld — the data is never loaded in the first place, so there is
                nothing to leak.
              </p>

              <ul className="mt-6 space-y-4">
                {[
                  {
                    title: 'Authorisation runs before retrieval',
                    body: 'The same access layer the REST API uses gates what reaches the model.',
                  },
                  {
                    title: 'No AI-generated SQL is ever executed',
                    body: 'Natural-language search maps to a fixed catalogue of parameterised queries.',
                  },
                  {
                    title: 'Works with no API key',
                    body: 'The built-in assistant composes grounded answers straight from your records.',
                  },
                ].map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success-50 text-success-600 dark:bg-success-500/10">
                      <Lock size={14} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.title}</p>
                      <p className="mt-0.5 text-sm text-ink-muted">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Illustrative chat, not a live one */}
            <div className="rounded-2xl border border-line bg-surface-raised p-6 shadow-panel">
              <div className="flex items-center gap-2.5 border-b border-line pb-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 text-white">
                  <Sparkles size={15} aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold text-ink">Smart Edu assistant</span>
              </div>

              <div className="mt-5 space-y-4">
                <div className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm text-white">
                    Which subjects should I focus on?
                  </p>
                </div>

                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-sunken px-4 py-3 text-sm text-ink">
                  <p>Based on your record:</p>
                  <ul className="mt-2 space-y-1 text-ink-muted">
                    <li>• Operating Systems is your weakest at 48% — 14 points below your average.</li>
                    <li>• Attendance there is 71%, under the 75% requirement.</li>
                    <li>• Two assignments are outstanding in that subject.</li>
                  </ul>
                  <p className="mt-2.5 text-ink-muted">
                    Start with the outstanding assignments — those are the fastest marks available.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Privacy ────────────────────────────────────────────────────── */}
      <section id="privacy" className="border-y border-line bg-gradient-to-br from-brand-600 to-violet-700 py-20 text-white">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <ShieldCheck size={26} aria-hidden="true" />
          </span>

          <h2 className="mt-6 text-3xl font-bold tracking-tight">The student holds the switch</h2>

          <p className="mx-auto mt-4 max-w-2xl text-balance text-[15px] leading-relaxed text-white/80">
            Most school systems assume a parent should see everything. Smart Edu does not. Each
            student decides, category by category, what their parents can view — attendance, marks,
            CGPA, assignments, reports, fees. Nobody else can change those settings, and the parent
            dashboard is honest about what has been withheld rather than showing a misleading zero.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { title: 'Per category', body: 'Six independent switches, not one blanket setting' },
              { title: 'Per parent', body: 'Different visibility for each linked guardian' },
              { title: 'Enforced in the database', body: 'Not a UI filter — unauthorised data is never read' },
            ].map((item) => (
              <div key={item.title} className="rounded-xl bg-white/10 p-5 backdrop-blur">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1.5 text-sm text-white/75">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Future vision ──────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink">Built to grow</h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            The AI layer is provider-neutral and the retrieval layer is vector-store-agnostic. Swap
            the built-in assistant for a hosted model, or the full-text search for a real vector
            database, without touching a single dashboard.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-2.5">
            {['OpenAI', 'Anthropic', 'FAISS', 'Chroma', 'Pinecone', 'Razorpay', 'PostgreSQL'].map(
              (integration) => (
                <span
                  key={integration}
                  className="rounded-full border border-line bg-surface-raised px-3.5 py-1.5 text-sm font-medium text-ink-muted"
                >
                  {integration}
                </span>
              )
            )}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-surface-sunken py-20">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink">
            See it with real data in it
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-muted">
            Sign in with a demo account and every dashboard is already populated — attendance
            records, published marks, graded assignments, an institution’s worth of analytics.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button to="/login" size="lg" iconRight={ArrowRight}>
              Try a demo account
            </Button>
            <Button to="/register" variant="secondary" size="lg">
              Create your own
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-line bg-surface py-12">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 text-white">
                <GraduationCap size={16} aria-hidden="true" />
              </span>
              <span className="text-sm font-bold text-ink">Smart Edu</span>
            </div>

            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Footer">
              {sections.map((section) => (
                <a
                  key={section.href}
                  href={section.href}
                  className="text-sm text-ink-muted transition hover:text-ink"
                >
                  {section.label}
                </a>
              ))}
              <Link to="/login" className="text-sm text-ink-muted transition hover:text-ink">
                Sign in
              </Link>
            </nav>
          </div>

          <p className="mt-8 border-t border-line pt-6 text-center text-xs text-ink-subtle">
            Smart Edu — an AI-powered school and college management platform.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
