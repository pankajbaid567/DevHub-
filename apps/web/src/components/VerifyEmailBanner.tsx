import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MailWarning, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth/context';
import { api, errorMessage } from '../lib/api';

/** Nudges signed-in users with an unconfirmed email; dismissible for this page load. */
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  if (!user || user.emailVerified || dismissed || pathname === '/verify-email') return null;

  const resend = async () => {
    setSending(true);
    try {
      await api('/auth/resend-verification', { method: 'POST' });
      toast.success(`Verification email sent to ${user.email}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div role="status" className="border-b border-warning/30 bg-warning/10">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm sm:px-6">
        <MailWarning className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <p className="flex-1">
          Confirm <strong>{user.email}</strong> to get email notifications.
        </p>
        <button
          type="button"
          onClick={resend}
          disabled={sending}
          className="font-medium text-accent hover:underline disabled:opacity-60"
        >
          {sending ? 'Sending…' : 'Resend email'}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded p-1 text-muted hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
