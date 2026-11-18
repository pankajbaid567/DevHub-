import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * Typed URL search-param state: filters live in the URL, so every view is shareable,
 * bookmarkable and works with the back button. Setting a filter resets the page to 1.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const state = Object.fromEntries(
    Object.entries(defaults).map(([k, d]) => [k, params.get(k) ?? d]),
  ) as T;
  const set = useCallback(
    (patch: Partial<T>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '' || v === defaults[k]) next.delete(k);
            else next.set(k, String(v));
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams],
  );
  return [state, set] as const;
}

export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (title) document.title = `${title} · DevHub+`;
    return () => {
      document.title = 'DevHub+ · Learn, build and ship together';
    };
  }, [title]);
}
