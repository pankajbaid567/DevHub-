import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { passwordSchema } from '@devhub/shared';
import { z } from 'zod';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { AuthShell } from './AuthShell';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
type Values = z.infer<typeof schema>;

export default function ResetPassword() {
  useDocumentTitle('Choose a new password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      toast.success('Password changed. Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError('root', { message: errorMessage(err) });
    }
  });

  if (!token) {
    return (
      <AuthShell title="Link incomplete" subtitle="Open the link from the email again.">
        <Link
          to="/forgot-password"
          className="block text-center font-medium text-accent hover:underline"
        >
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="You'll be signed out on every other device.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {errors.root && (
          <div
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {errors.root.message}{' '}
            <Link to="/forgot-password" className="underline">
              Request a new link
            </Link>
          </div>
        )}
        <Field
          label="New password"
          error={errors.password?.message}
          hint="At least 8 characters, with a letter and a digit"
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              autoFocus
              {...register('password')}
            />
          )}
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          {(p) => (
            <Input {...p} type="password" autoComplete="new-password" {...register('confirm')} />
          )}
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Set password
        </Button>
      </form>
    </AuthShell>
  );
}
