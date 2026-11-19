import { useSyncExternalStore } from 'react';
import type { InterviewProblem, InterviewStateDto } from '@devhub/shared';
import { api } from './api';

export const problemsQuery = {
  queryKey: ['interview-problems'],
  queryFn: () =>
    api<{ items: InterviewProblem[]; voiceEnabled: boolean }>('/sessions/interview/problems'),
  staleTime: 10 * 60_000,
};

/** Milliseconds the server clock is ahead of this browser's, from a server timestamp. */
export const clockOffset = (state: Pick<InterviewStateDto, 'serverNow'>) =>
  Date.parse(state.serverNow) - Date.now();

// One shared once-a-second ticker for every countdown on the page.
const listeners = new Set<() => void>();
let ticker: number | undefined;
function subscribe(cb: () => void) {
  listeners.add(cb);
  ticker ??= window.setInterval(() => listeners.forEach((l) => l()), 1_000);
  return () => {
    listeners.delete(cb);
    if (!listeners.size) {
      window.clearInterval(ticker);
      ticker = undefined;
    }
  };
}
const second = () => Math.floor(Date.now() / 1_000) * 1_000;
const never = () => () => {};

/** The current server time, updated every second while `active`. */
export function useServerNow(offsetMs: number, active: boolean): number {
  return useSyncExternalStore(active ? subscribe : never, second) + offsetMs;
}
