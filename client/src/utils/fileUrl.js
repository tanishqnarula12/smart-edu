/**
 * Uploaded files are served from the API's own origin as a relative path
 * (`/uploads/...`). That resolves fine when the client and API share one
 * host, but in a split deployment (client on Vercel, API on Render) a plain
 * relative href silently resolves against the CLIENT's origin instead —
 * where nothing exists, so the SPA's own catch-all route swallows it and the
 * app just reloads instead of opening the file.
 *
 * `VITE_API_URL` already carries the real API origin in that setup; derive
 * the bare origin from it (strip the trailing `/api`) and prefix any
 * relative upload path with it. When `VITE_API_URL` is unset (the default,
 * combined-host deployment) this resolves to '', leaving paths untouched.
 */
const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');

export function resolveFileUrl(path) {
  if (!path) return path;
  if (/^(https?:)?\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}

export default resolveFileUrl;
