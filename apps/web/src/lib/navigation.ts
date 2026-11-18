/**
 * Only allow same-site relative redirects after sign-in. Rejects absolute URLs and
 * protocol-relative `//evil.com` paths, preventing open redirects via ?next=.
 */
export const safeNext = (next: string | null): string =>
  next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : '/dashboard';
