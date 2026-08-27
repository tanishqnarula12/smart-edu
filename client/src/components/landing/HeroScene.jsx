import { useRef, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { cn } from '../../utils/cn.js';

/**
 * The landing page's hero. Follows the site's light/dark toggle like every
 * other section — via the shared `ink`/`surface` tokens plus `currentColor`
 * for the SVG backdrop — rather than being a permanently-dark island that
 * clashes with a light-mode page around it.
 *
 * Mouse/click tracking is scoped to this section via React's own event
 * props (not a document-level listener), and positions are container-
 * relative so the effects never drift once the page scrolls past the hero.
 */

const TIER_ONE = ['Smarter', 'management.'];
const TIER_TWO = ['Better', 'insights.', 'Personalised', 'education.'];

const GRID_LINES = [
  { x1: '0', y1: '22%', x2: '100%', y2: '22%', delay: 0 },
  { x1: '0', y1: '78%', x2: '100%', y2: '78%', delay: 80 },
  { x1: '18%', y1: '0', x2: '18%', y2: '100%', delay: 160 },
  { x1: '82%', y1: '0', x2: '82%', y2: '100%', delay: 240 },
];

const DETAIL_DOTS = [
  { cx: '18%', cy: '22%', delay: 400 },
  { cx: '82%', cy: '22%', delay: 440 },
  { cx: '18%', cy: '78%', delay: 480 },
  { cx: '82%', cy: '78%', delay: 520 },
];

const PARTICLES = [
  { top: '28%', left: '12%', delay: 0 },
  { top: '62%', left: '88%', delay: 700 },
  { top: '42%', left: '8%', delay: 1400 },
  { top: '74%', left: '92%', delay: 2100 },
];

const CORNERS = [
  { className: 'top-6 left-6', delay: 100 },
  { className: 'top-6 right-6', delay: 150 },
  { className: 'bottom-6 left-6', delay: 200 },
  { className: 'bottom-6 right-6', delay: 250 },
];

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// `gradient` paints the clip on this same element rather than a shared
// ancestor — an ancestor's `background-clip: text` stops compositing with a
// transparent-colored descendant once that descendant gets its own layer
// (which `word-in`'s transform/filter/opacity animation forces), so a
// gradient painted one level up renders invisible until something like
// :hover removes the descendant from its own layer.
function AnimatedWord({ children, delayMs, gradient = false }) {
  return (
    <span
      className={cn(
        'mx-[0.1em] inline-block opacity-0 [animation-fill-mode:forwards] animate-word-in transition-transform duration-300 hover:-translate-y-0.5',
        gradient
          ? 'bg-gradient-to-r from-brand-600 to-violet-600 bg-clip-text text-transparent dark:from-brand-300 dark:to-violet-300'
          : 'transition-[color,transform] hover:text-brand-600 dark:hover:text-brand-200'
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {children}
    </span>
  );
}

export function HeroScene() {
  const sceneRef = useRef(null);
  const [glow, setGlow] = useState({ x: 0, y: 0, opacity: 0 });
  const [ripples, setRipples] = useState([]);

  const handleMouseMove = (event) => {
    if (prefersReducedMotion) return;
    const bounds = sceneRef.current.getBoundingClientRect();
    setGlow({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, opacity: 1 });
  };

  const handleClick = (event) => {
    if (prefersReducedMotion) return;
    const bounds = sceneRef.current.getBoundingClientRect();
    const ripple = { id: Date.now(), x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    setRipples((current) => [...current, ripple]);
    setTimeout(() => setRipples((current) => current.filter((r) => r.id !== ripple.id)), 800);
  };

  return (
    <section
      ref={sceneRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setGlow((current) => ({ ...current, opacity: 0 }))}
      onClick={handleClick}
      className="relative isolate overflow-hidden bg-gradient-to-b from-brand-50 via-white to-violet-50 text-ink dark:from-[#0a0e1f] dark:via-[#0c1129] dark:to-[#0f1420]"
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full text-ink-subtle/60"
        aria-hidden="true"
      >
        <defs>
          <pattern id="hero-grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M 56 0 L 0 0 0 56" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" />
        <g className="text-brand-500 dark:text-brand-400">
          {GRID_LINES.map((line) => (
            <line
              key={`${line.x1}-${line.y1}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="currentColor"
              strokeWidth="0.5"
              strokeDasharray="5 5"
              className="animate-grid-line-draw"
              style={{ animationDelay: `${line.delay}ms` }}
            />
          ))}
          {DETAIL_DOTS.map((dot) => (
            <circle
              key={`${dot.cx}-${dot.cy}`}
              cx={dot.cx}
              cy={dot.cy}
              r="2"
              fill="currentColor"
              className="animate-dot-pulse"
              style={{ animationDelay: `${dot.delay}ms` }}
            />
          ))}
        </g>
      </svg>

      {CORNERS.map((corner) => (
        <div
          key={corner.className}
          className={cn(
            'pointer-events-none absolute h-9 w-9 border border-ink/15 opacity-0 [animation-fill-mode:forwards] animate-content-reveal',
            corner.className
          )}
          style={{ animationDelay: `${corner.delay}ms` }}
          aria-hidden="true"
        />
      ))}

      {!prefersReducedMotion &&
        PARTICLES.map((particle) => (
          <div
            key={`${particle.top}-${particle.left}`}
            className="pointer-events-none absolute h-1 w-1 rounded-full bg-brand-500 animate-particle-float dark:bg-brand-300"
            style={{ top: particle.top, left: particle.left, animationDelay: `${particle.delay}ms` }}
            aria-hidden="true"
          />
        ))}

      {!prefersReducedMotion && (
        <div
          className="pointer-events-none absolute h-80 w-80 rounded-full blur-3xl transition-opacity duration-300"
          style={{
            left: glow.x,
            top: glow.y,
            opacity: glow.opacity * 0.35,
            transform: 'translate(-50%, -50%)',
            background:
              'radial-gradient(circle, rgba(129,140,248,0.35), rgba(139,92,246,0.2), transparent 70%)',
          }}
          aria-hidden="true"
        />
      )}

      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="pointer-events-none absolute h-2 w-2 rounded-full bg-brand-500/70 animate-ripple-out dark:bg-brand-300/70"
          style={{ left: ripple.x, top: ripple.y }}
          aria-hidden="true"
        />
      ))}

      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-20 text-center sm:pt-28">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised/70 px-3 py-1 text-xs font-medium text-ink-muted opacity-0 [animation-fill-mode:forwards] animate-content-reveal backdrop-blur"
          style={{ animationDelay: '100ms' }}
        >
          <Sparkles size={12} aria-hidden="true" />
          AI-powered academic management
        </span>

        <h1 className="mx-auto mt-6 max-w-3xl text-balance text-3xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl">
          <div>
            {TIER_ONE.map((word, index) => (
              <AnimatedWord key={word} delayMs={350 + index * 130}>
                {word}
              </AnimatedWord>
            ))}
          </div>
          <div className="mt-2 text-2xl font-light sm:text-4xl lg:text-5xl">
            {TIER_TWO.map((word, index) => (
              <AnimatedWord key={word} delayMs={650 + index * 110} gradient>
                {word}
              </AnimatedWord>
            ))}
          </div>
        </h1>

        <div
          className="opacity-0 [animation-fill-mode:forwards] animate-content-reveal"
          style={{ animationDelay: '1150ms' }}
        >
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
      </div>
    </section>
  );
}

export default HeroScene;
