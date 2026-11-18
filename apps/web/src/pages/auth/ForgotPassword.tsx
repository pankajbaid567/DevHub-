import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { forgotPasswordSchema } from '@devhub/shared';
import type { z } from 'zod';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { AuthShell } from './AuthShell';

type Values = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  useDocumentTitle('Reset password');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api('/auth/forgot-password', { method: 'POST', body: values });
      setSentTo(values.email);
    } catch (err) {
      setError('root', { message: errorMessage(err) });
    }
  });

  if (sentTo) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle="If that address has an account, a link is on its way."
      >
        <div className="flex flex-col items-center gap-4 text-center text-sm text-muted">
          <MailCheck className="h-10 w-10 text-success" aria-hidden />
          <p>
            We sent a reset link to <strong className="text-fg">{sentTo}</strong> if it belongs to
            an account. The link works once and expires in 30 minutes.
          </p>
          <Link to="/login" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="We'll email you a link to choose a new one.">
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
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Remembered it?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
