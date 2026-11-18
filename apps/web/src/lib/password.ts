/** Length matters most (NIST 800-63B); this meter rewards length and variety. */
export function passwordStrength(p: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p) && /[^a-zA-Z0-9]/.test(p)) score++;
  const labels = ['Too short', 'Weak', 'Okay', 'Strong', 'Excellent'];
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score]! };
}
