import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { loginSchema, type LoginInput } from '@devhub/shared';
import { useAuth } from '../../auth/context';
import { errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { AuthShell } from './AuthShell';
import { safeNext } from '../../lib/navigation';
import { SocialButtons } from './SocialButtons';

/** Second step for accounts with two-factor authentication. */
function MfaStep({ mfaToken, next }: { mfaToken: string; next: string }) {
  const { verifyMfa } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await verifyMfa(mfaToken, code);
      toast.success(`Welcome back, ${user.displayName ?? user.username}!`);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell
      title="Two-factor authentication"
      subtitle="Enter the code from your authenticator app."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
        <Field
          label="Authentication code"
          hint="Lost your device? Enter one of your recovery codes instead."
        >
          {(p) => (
            <Input
              {...p}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="text"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123456"
              className="text-center font-mono text-lg tracking-widest"
            />
          )}
        </Field>
        <Button type="submit" className="w-full" loading={busy} disabled={code.trim().length < 6}>
          Verify
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        <Link to="/login" className="text-accent hover:underline" reloadDocument>
          Start over
        </Link>
      </p>
    </AuthShell>
  );
}

export default function Login() {
  const { login, status } = useAuth();
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const oauthError = params.get('error');
  const challenge = mfaToken ?? params.get('mfaToken');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  if (status === 'authenticated') return <Navigate to={next} replace />;
  if (challenge) return <MfaStep mfaToken={challenge} next={next} />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const user = await login(values);
      if ('mfaRequired' in user) {
        setMfaToken(user.mfaToken);
        return;
      }
      toast.success(`Welcome back, ${user.displayName ?? user.username}!`);
      navigate(next, { replace: true });
    } catch (err) {
      setError('root', { message: errorMessage(err) });
    }
  });

  return (
    <AuthShell title="Sign in to DevHub+" subtitle="Pick up where you left off.">
      {oauthError && !errors.root && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {oauthError.slice(0, 200)}
        </p>
      )}
      <SocialButtons next={next} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {errors.root && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {errors.root.message}
          </p>
        )}
        <Field label="Email" error={errors.email?.message}>
          {(p) => (
            <Input {...p} type="email" autoComplete="email" autoFocus {...register('email')} />
          )}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
          )}
        </Field>
        <div className="-mt-2 text-right text-xs">
          <Link to="/forgot-password" className="text-accent hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-center text-xs text-muted">
          Demo account: ada@devhub.dev / password123
        </p>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New here?{' '}
        <Link
          to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="font-medium text-accent hover:underline"
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
