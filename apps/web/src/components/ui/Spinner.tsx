import { Loader2 } from 'lucide-react';

export function PageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted"
    >
      <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}
