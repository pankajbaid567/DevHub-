import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { BellRing, KeyRound, Link2, MailCheck, MailWarning, ShieldCheck } from 'lucide-react';
import { TwoFactorSettings } from './TwoFactorSettings';
import { toast } from 'sonner';
import { passwordSchema, type AuthResponse, type CurrentUser } from '@devhub/shared';
import { api, errorMessage, fieldErrors, session } from '../lib/api';
import { useAuth } from '../auth/context';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Badge, Card } from '../components/ui/primitives';

const passwordForm = z
  .object({
    currentPassword: z.string().max(72).optional(),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
type PasswordValues = z.infer<typeof passwordForm>;

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof KeyRound;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 text-accent" aria-hidden /> {title}
      </h3>
      {children}
    </Card>
  );
}

/** Private "Account" tab: email status, notification preference, password, linked logins. */
export function AccountSettings() {
  const { user, setUser } = useAuth();

  const prefs = useMutation({
    mutationFn: (emailNotifications: boolean) =>
      api<CurrentUser>('/users/me', { method: 'PATCH', body: { emailNotifications } }),
    onSuccess: (u) => {
      setUser(u);
      toast.success(u.emailNotifications ? 'Email notifications on' : 'Email notifications off');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const resend = useMutation({
    mutationFn: () => api('/auth/resend-verification', { method: 'POST' }),
    onSuccess: () => toast.success('Verification email sent'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordForm) });

  if (!user) return null;

  const onPassword = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      const auth = await api<AuthResponse>('/auth/change-password', {
        method: 'POST',
        body: { ...(user.hasPassword && { currentPassword }), newPassword },
      });
      session.set(auth);
      reset();
      toast.success(
        user.hasPassword ? 'Password changed. Other devices were signed out.' : 'Password set.',
      );
    } catch (err) {
      const fields = fieldErrors(err);
      if (fields.currentPassword) setError('currentPassword', { message: fields.currentPassword });
      else setError('root', { message: errorMessage(err) });
    }
  });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section icon={user.emailVerified ? MailCheck : MailWarning} title="Email">
        <p className="text-sm">
          {user.email}{' '}
          {user.emailVerified ? (
            <Badge tone="success">verified</Badge>
          ) : (
            <Badge tone="warning">not verified</Badge>
          )}
        </p>
        {!user.emailVerified && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            loading={resend.isPending}
            onClick={() => resend.mutate()}
          >
            Resend verification email
          </Button>
        )}
      </Section>

      <Section icon={BellRing} title="Notifications">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-[var(--color-accent)]"
            checked={user.emailNotifications}
            disabled={prefs.isPending}
            onChange={(e) => prefs.mutate(e.target.checked)}
          />
          <span>
            Email me when someone answers my question, accepts my answer, or a session I joined is
            about to start.
            {!user.emailVerified && (
              <span className="mt-1 block text-xs text-muted">
                Emails start once your address is verified.
              </span>
            )}
          </span>
        </label>
      </Section>

      <Section icon={KeyRound} title={user.hasPassword ? 'Change password' : 'Set a password'}>
        {!user.hasPassword && (
          <p className="mb-3 text-sm text-muted">
            You signed up with {user.providers.join(' / ')}. Add a password to also sign in with
            your email.
          </p>
        )}
        <form onSubmit={onPassword} className="space-y-3" noValidate>
          {errors.root && (
            <p role="alert" className="text-sm text-danger">
              {errors.root.message}
            </p>
          )}
          {user.hasPassword && (
            <Field label="Current password" error={errors.currentPassword?.message}>
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="current-password"
                  {...register('currentPassword')}
                />
              )}
            </Field>
          )}
          <Field label="New password" error={errors.newPassword?.message}>
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                {...register('newPassword')}
              />
            )}
          </Field>
          <Field label="Confirm new password" error={errors.confirm?.message}>
            {(p) => (
              <Input {...p} type="password" autoComplete="new-password" {...register('confirm')} />
            )}
          </Field>
          <Button type="submit" loading={isSubmitting}>
            {user.hasPassword ? 'Change password' : 'Set password'}
          </Button>
        </form>
      </Section>

      <Section icon={ShieldCheck} title="Two-factor authentication">
        <TwoFactorSettings />
      </Section>

      <Section icon={Link2} title="Sign-in methods">
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            Email and password
            <Badge tone={user.hasPassword ? 'success' : 'neutral'}>
              {user.hasPassword ? 'enabled' : 'not set'}
            </Badge>
          </li>
          {(['github', 'google'] as const).map((p) => (
            <li key={p} className="flex items-center justify-between capitalize">
              {p}
              <Badge tone={user.providers.includes(p) ? 'success' : 'neutral'}>
                {user.providers.includes(p) ? 'linked' : 'not linked'}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Signing in with GitHub or Google using the same verified email links it automatically.
        </p>
      </Section>
    </div>
  );
}
