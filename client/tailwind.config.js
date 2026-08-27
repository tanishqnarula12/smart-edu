/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        // Semantic tokens — components reference these, never raw palette
        // values, so the whole product re-themes from one place.
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          subtle: 'rgb(var(--ink-subtle) / <alpha-value>)',
        },
        line: 'rgb(var(--line) / <alpha-value>)',
        success: {
          50: '#ecfdf5', 100: '#d1fae5', 500: '#10b981', 600: '#059669', 700: '#047857',
        },
        warning: {
          50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#d97706', 700: '#b45309',
        },
        danger: {
          50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c',
        },
        info: {
          50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
        },
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        'card-hover': '0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 6px -2px rgb(0 0 0 / 0.06)',
        panel: '0 8px 30px -6px rgb(0 0 0 / 0.12)',
        popover: '0 12px 40px -8px rgb(0 0 0 / 0.18)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        // Landing page hero scene — its own set, kept separate from the ones
        // above so tuning the entrance timing never touches shared UI.
        'content-reveal': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'word-in': {
          '0%': { opacity: '0', transform: 'translateY(22px) scale(0.94)', filter: 'blur(6px)' },
          '60%': { opacity: '0.85', transform: 'translateY(4px) scale(0.99)', filter: 'blur(1px)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
        },
        // Same reveal, no `filter` — `filter` + `background-clip: text` is a
        // flaky combination in real browsers (can leave a descender like the
        // "g" in "insights" looking clipped after the animation settles), so
        // gradient words use this instead of `word-in`.
        'word-in-solid': {
          '0%': { opacity: '0', transform: 'translateY(22px) scale(0.94)' },
          '60%': { opacity: '0.85', transform: 'translateY(4px) scale(0.99)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'grid-line-draw': {
          '0%': { strokeDashoffset: '1000', opacity: '0' },
          '50%': { opacity: '0.35' },
          '100%': { strokeDashoffset: '0', opacity: '0.18' },
        },
        'dot-pulse': {
          '0%, 100%': { opacity: '0.15', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(1.2)' },
        },
        'particle-float': {
          '0%, 100%': { transform: 'translate(0, 0)', opacity: '0.2' },
          '25%': { transform: 'translate(4px, -10px)', opacity: '0.6' },
          '50%': { transform: 'translate(-3px, -5px)', opacity: '0.35' },
          '75%': { transform: 'translate(6px, -14px)', opacity: '0.7' },
        },
        'ripple-out': {
          '0%': { transform: 'translate(-50%, -50%) scale(0.4)', opacity: '0.55' },
          '100%': { transform: 'translate(-50%, -50%) scale(9)', opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'fade-up': 'fade-up 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left': 'slide-in-left 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        'content-reveal': 'content-reveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'word-in': 'word-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'word-in-solid': 'word-in-solid 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'grid-line-draw': 'grid-line-draw 0.9s ease-out forwards',
        'dot-pulse': 'dot-pulse 3s ease-in-out infinite',
        'particle-float': 'particle-float 5s ease-in-out infinite',
        'ripple-out': 'ripple-out 0.8s ease-out forwards',
      },
    },
  },
  plugins: [],
};
