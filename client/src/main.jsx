import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import './index.css';

/*
 * Apply the stored theme before React paints, so a dark-mode user never sees
 * a white flash on load. ThemeProvider takes over from here.
 */
(function applyStoredTheme() {
  try {
    const preference = localStorage.getItem('smart-edu-theme') ?? 'system';
    const isDark =
      preference === 'dark' ||
      (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  } catch {
    // localStorage can be unavailable; the default light theme is fine.
  }
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
