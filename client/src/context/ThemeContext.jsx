import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Light / dark theme.
 *
 * Three states: 'light', 'dark' and 'system'. The stored preference is applied
 * before paint by the inline script in main.jsx, so there is no flash of the
 * wrong theme on load.
 */

const ThemeContext = createContext(null);
const STORAGE_KEY = 'smart-edu-theme';

function resolve(preference) {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? 'system';
    } catch {
      return 'system';
    }
  });

  const [theme, setTheme] = useState(() => resolve(preference));

  useEffect(() => {
    const applied = resolve(preference);
    setTheme(applied);

    document.documentElement.classList.toggle('dark', applied === 'dark');
    document.documentElement.style.colorScheme = applied;

    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies.
    }
  }, [preference]);

  // Follow the OS while the preference is 'system'.
  useEffect(() => {
    if (preference !== 'system') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event) => {
      const applied = event.matches ? 'dark' : 'light';
      setTheme(applied);
      document.documentElement.classList.toggle('dark', applied === 'dark');
    };

    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [preference]);

  const toggleTheme = useCallback(() => {
    setPreference(resolve(preference) === 'dark' ? 'light' : 'dark');
  }, [preference]);

  const value = useMemo(
    () => ({ theme, preference, setPreference, toggleTheme }),
    [theme, preference, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider');
  return context;
}

export default ThemeContext;
