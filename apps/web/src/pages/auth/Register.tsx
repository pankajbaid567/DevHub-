import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { registerSchema } from '@devhub/shared';
import type { z } from 'zod';
import { useAuth } from '../../auth/context';
import { errorMessage, fieldErrors } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { AuthShell } from './AuthShell';
import { safeNext } from '../../lib/navigation';
import { passwordStrength } from '../../lib/password';
import { cn } from '../../lib/utils';

type Form = z.input<typeof registerSchema>;

export default function Register() {
  const { register: signUp, status } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(registerSchema) });

  const password = useWatch({ control, name: 'password' }) ?? '';
  if (status === 'authenticated') return <Navigate to={next} replace />;

  const strength = passwordStrength(password);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const user = await signUp(registerSchema.parse(values));
      toast.success(`Welcome to DevHub+, ${user.displayName ?? user.username}!`);
      navigate(next, { replace: true });
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) {
        for (const [k, v] of Object.entries(fields)) setError(k as keyof Form, { message: v });
      } else setError('root', { message: errorMessage(err) });
    }
  });

  return (
    <AuthShell title="Join DevHub+" subtitle="Ask, answer, pair-program and grow your reputation.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {errors.root && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {errors.root.message}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Username" error={errors.username?.message} hint="Letters, digits, _">
            {(p) => <Input {...p} autoComplete="username" autoFocus {...register('username')} />}
          </Field>
          <Field label="Display name" error={errors.displayName?.message} hint="Optional">
            {(p) => (
              <Input
                {...p}
                autoComplete="name"
                {...register('displayName', { setValueAs: (v) => v || undefined })}
              />
            )}
          </Field>
        </div>
        <Field label="Email" error={errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}
        </Field>
        <Field
          label="Password"
          error={errors.password?.message}
          hint="At least 8 characters with a letter and a digit"
        >
          {(p) => (
            <Input {...p} type="password" autoComplete="new-password" {...register('password')} />
          )}
        </Field>
        {password && (
          <div aria-live="polite">
            <div className="flex gap-1" aria-hidden>
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 flex-1 rounded-full bg-surface-2',
                    strength.score >= i &&
                      ['bg-danger', 'bg-warning', 'bg-accent-2', 'bg-success'][strength.score - 1],
                  )}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">Password strength: {strength.label}</p>
          </div>
        )}
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
