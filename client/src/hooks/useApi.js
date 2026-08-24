import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Data fetching with the four states every page needs (§48):
 * loading, empty, error and success — plus a retry.
 *
 * `deps` behaves like a useEffect dependency array. Results from a superseded
 * request are discarded, so switching filters quickly cannot leave stale data
 * on screen.
 */
export function useApi(fetcher, deps = [], { immediate = true, onSuccess, onError } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(immediate);

  const requestId = useRef(0);
  const mounted = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args) => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetcherRef.current(...args);
      // A later request has already started — throw this result away.
      if (!mounted.current || id !== requestId.current) return undefined;

      setData(result);
      onSuccess?.(result);
      return result;
    } catch (caught) {
      if (!mounted.current || id !== requestId.current) return undefined;
      setError(caught);
      onError?.(caught);
      return undefined;
    } finally {
      if (mounted.current && id === requestId.current) setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (immediate) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, isLoading, refetch: run, setData };
}

/**
 * Fire-and-report mutations (create/update/delete) with a pending flag, so a
 * submit button can disable itself without every form tracking that by hand.
 */
export function useMutation(mutator, { onSuccess, onError } = {}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);

  const mutate = useCallback(
    async (...args) => {
      setIsPending(true);
      setError(null);
      try {
        const result = await mutator(...args);
        onSuccess?.(result);
        return result;
      } catch (caught) {
        setError(caught);
        onError?.(caught);
        throw caught;
      } finally {
        setIsPending(false);
      }
    },
    [mutator, onSuccess, onError]
  );

  return { mutate, isPending, error };
}

/** Debounce a rapidly-changing value — used by search inputs (§45). */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/** Persist a value in localStorage, tolerating a blocked or full store. */
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const set = useCallback(
    (next) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Private mode or a full quota — the value still works in memory.
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, set];
}

/** Run a handler when a click lands outside the ref — for menus and popovers. */
export function useClickOutside(ref, handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const listener = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler, enabled]);
}

/** Close on Escape — every dismissible overlay uses this. */
export function useEscapeKey(handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const listener = (event) => {
      if (event.key === 'Escape') handler(event);
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [handler, enabled]);
}

/** Media query as state, for layout decisions React needs to know about. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = (event) => setMatches(event.matches);
    setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

export default useApi;
