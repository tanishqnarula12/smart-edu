import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, CornerDownLeft } from 'lucide-react';
import { searchApi } from '../services/endpoints.js';
import { useClickOutside, useDebounced, useEscapeKey } from '../hooks/useApi.js';
import { Avatar } from '../components/ui/Misc.jsx';
import { humanise } from '../utils/format.js';
import { cn } from '../utils/cn.js';

/**
 * Global search (§45).
 *
 * Debounced at 280ms — long enough that typing does not fire a request per
 * keystroke, short enough to still feel immediate.
 */
export function GlobalSearch({ className }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const debouncedQuery = useDebounced(query, 280);

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);
  useEscapeKey(() => {
    setIsOpen(false);
    inputRef.current?.blur();
  }, isOpen);

  // Ctrl/Cmd-K focuses search from anywhere.
  useEffect(() => {
    const listener = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults(null);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    searchApi
      .global(debouncedQuery.trim())
      .then((data) => {
        if (cancelled) return;
        setResults(data);
        setHighlighted(0);
      })
      .catch(() => {
        if (!cancelled) setResults(null);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Flatten the grouped results so arrow keys can walk them in order.
  const flat = results
    ? Object.entries(results.results).flatMap(([group, items]) =>
        items.map((item) => ({ ...item, group }))
      )
    : [];

  const go = (item) => {
    if (!item?.href) return;
    setIsOpen(false);
    setQuery('');
    setResults(null);
    navigate(item.href);
  };

  const handleKeyDown = (event) => {
    if (!flat.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % flat.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + flat.length) % flat.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(flat[highlighted]);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search…"
          aria-label="Search"
          aria-expanded={isOpen}
          role="combobox"
          aria-controls="global-search-results"
          className="h-9 w-full rounded-xl border border-line bg-surface-sunken pl-9 pr-16 text-sm text-ink transition placeholder:text-ink-subtle focus:border-brand-500 focus:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />

        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-surface-raised px-1.5 py-0.5 font-sans text-[10px] font-medium text-ink-subtle sm:block">
          ⌘K
        </kbd>
      </div>

      {isOpen && query.trim().length >= 2 && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-2 max-h-[24rem] animate-scale-in overflow-y-auto rounded-2xl border border-line bg-surface-raised p-2 shadow-popover scrollbar-slim"
        >
          {isSearching ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              Searching…
            </div>
          ) : !flat.length ? (
            <p className="px-3 py-8 text-center text-sm text-ink-muted">
              Nothing matched “{query}”.
            </p>
          ) : (
            Object.entries(results.results).map(([group, items]) =>
              items.length ? (
                <div key={group} className="mb-1 last:mb-0">
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                    {humanise(group)}
                  </p>
                  {items.map((item) => {
                    const flatIndex = flat.findIndex(
                      (candidate) => candidate.id === item.id && candidate.group === group
                    );
                    const isHighlighted = flatIndex === highlighted;

                    return (
                      <button
                        key={`${group}-${item.id}`}
                        type="button"
                        role="option"
                        aria-selected={isHighlighted}
                        onMouseEnter={() => setHighlighted(flatIndex)}
                        onClick={() => go(item)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition',
                          isHighlighted ? 'bg-brand-50 dark:bg-brand-950/40' : 'hover:bg-surface-sunken'
                        )}
                      >
                        {(item.name || item.avatarUrl) && (
                          <Avatar name={item.name ?? item.label} src={item.avatarUrl} size="xs" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {item.name ?? item.label}
                          </span>
                          {item.sublabel && (
                            <span className="block truncate text-xs text-ink-muted">{item.sublabel}</span>
                          )}
                        </span>
                        {isHighlighted && (
                          <CornerDownLeft size={13} className="shrink-0 text-ink-subtle" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null
            )
          )}
        </div>
      )}
    </div>
  );
}

export default GlobalSearch;
