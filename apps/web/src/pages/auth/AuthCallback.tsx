import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { refreshSession } from '../../lib/api';
import { safeNext } from '../../lib/navigation';
import { PageSpinner } from '../../components/ui/Spinner';

/**
 * Landing page after GitHub/Google sign-in. The API already set the httpOnly refresh cookie;
 * exchanging it for an access token here keeps every token out of the URL and history.
 */
export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode double-invokes effects; rotate the cookie once
    ran.current = true;
    const next = safeNext(params.get('returnTo'));
    void refreshSession().then((auth) => {
      if (auth) {
        toast.success(`Signed in as ${auth.user.displayName ?? auth.user.username}`);
        navigate(next, { replace: true });
      } else {
        navigate('/login?error=Sign-in%20could%20not%20be%20completed', { replace: true });
      }
    });
  }, [params, navigate]);

  return <PageSpinner label="Signing you in" />;
}
