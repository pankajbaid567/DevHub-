import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type ResolvedTheme as Resolved, type ThemeChoice } from './context';

const KEY = 'devhub.theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'cyberpunk' ? v : 'system';
  } catch {
    return 'system';
  }
}

const resolve = (c: ThemeChoice): Resolved =>
  c === 'system' ? (media().matches ? 'dark' : 'light') : c;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const [resolved, setResolved] = useState<Resolved>(() => resolve(readChoice()));

  useEffect(() => {
    const apply = () => {
      const r = resolve(choice);
      setResolved(r);
      document.documentElement.dataset.theme = r;
      document.documentElement.classList.toggle('dark', r !== 'light');
    };
    apply();
    if (choice !== 'system') return;
    const m = media();
    m.addEventListener('change', apply);
    return () => m.removeEventListener('change', apply);
  }, [choice]);

  const setChoice = useCallback((t: ThemeChoice) => {
    setChoiceState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* private mode: theme just won't persist */
    }
  }, []);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
