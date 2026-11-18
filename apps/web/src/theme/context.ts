import { createContext, useContext } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark' | 'cyberpunk';
export type ResolvedTheme = Exclude<ThemeChoice, 'system'>;

export interface ThemeContextValue {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setChoice: (t: ThemeChoice) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
