import { Link } from 'react-router-dom';
import { GraduationCap, ShieldCheck, Sparkles, BarChart3 } from 'lucide-react';

/**
 * Split layout for the auth pages: form on the left, product story on the
 * right. The panel collapses away below `lg` so the form owns a small screen.
 */
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-surface-sunken">
      {/* Form */}
      <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-8 lg:w-[52%] lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-8 inline-flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm">
              <GraduationCap size={21} aria-hidden="true" />
            </span>
            <span className="text-lg font-bold tracking-tight text-ink">Smart Edu</span>
          </Link>

          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}
        </div>
      </div>

      {/* Story panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-violet-800 lg:flex lg:w-[48%]">
        {/* Soft blurred orbs — depth without an image asset. */}
        <div
          className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-violet-400/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex flex-col justify-center px-14 text-white">
          <h2 className="max-w-md text-3xl font-bold leading-tight tracking-tight text-balance">
            Smarter management. Better insights. Personalised education.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/80">
            One place where students, parents, teachers and administrators see the same academic
            reality — with AI that respects who is allowed to see what.
          </p>

          <ul className="mt-10 space-y-5">
            {[
              {
                icon: BarChart3,
                title: 'Analytics that mean something',
                body: 'Attendance, performance and risk indicators computed from live records.',
              },
              {
                icon: Sparkles,
                title: 'AI for every role',
                body: 'A tutor for students, an explainer for parents, a workload assistant for teachers.',
              },
              {
                icon: ShieldCheck,
                title: 'Privacy the student controls',
                body: 'Parents see exactly what the student chooses to share — nothing more.',
              },
            ].map((feature) => (
              <li key={feature.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                  <feature.icon size={19} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold">{feature.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-white/70">{feature.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
