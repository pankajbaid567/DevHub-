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

export default function Login() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  if (status === 'authenticated') return <Navigate to={next} replace />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const user = await login(values);
      toast.success(`Welcome back, ${user.displayName ?? user.username}!`);
      navigate(next, { replace: true });
    } catch (err) {
      setError('root', { message: errorMessage(err) });
    }
  });

  return (
    <AuthShell title="Sign in to DevHub+" subtitle="Pick up where you left off.">
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
