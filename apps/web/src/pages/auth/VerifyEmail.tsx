import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { CurrentUser } from '@devhub/shared';
import { api, errorMessage, session } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { PageSpinner } from '../../components/ui/Spinner';
import { AuthShell } from './AuthShell';

export default function VerifyEmail() {
  useDocumentTitle('Verify email');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<{ ok: boolean; message?: string } | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // tokens are single-use: never submit twice
    ran.current = true;
    api<CurrentUser>('/auth/verify-email', { method: 'POST', body: { token } })
      .then((user) => {
        if (session.currentUser?.id === user.id) session.updateUser(user);
        setState({ ok: true });
      })
      .catch((err: unknown) => setState({ ok: false, message: errorMessage(err) }));
  }, [token]);

  if (!state) return <PageSpinner label="Verifying" />;
  return (
    <AuthShell
      title={state.ok ? 'Email confirmed' : 'Could not verify'}
      subtitle={state.ok ? 'Email notifications are now on.' : (state.message ?? '')}
    >
      <div className="flex flex-col items-center gap-4">
        {state.ok ? (
          <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
        ) : (
          <XCircle className="h-10 w-10 text-danger" aria-hidden />
        )}
        <Link
          to={state.ok ? '/dashboard' : '/'}
          className="font-medium text-accent hover:underline"
        >
          {state.ok ? 'Go to your dashboard' : 'Back home'}
        </Link>
        {!state.ok && (
          <p className="text-center text-sm text-muted">
            Signed in? Use “Resend email” in the banner at the top of any page.
          </p>
        )}
      </div>
    </AuthShell>
  );
}
