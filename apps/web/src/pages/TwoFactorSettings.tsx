import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Copy, Download, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import type { CurrentUser, TwoFactorSetupDto } from '@devhub/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../auth/context';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Badge } from '../components/ui/primitives';

function Qr({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(value, { margin: 1, width: 192 }).then((url) => alive && setSrc(url));
    return () => {
      alive = false;
    };
  }, [value]);
  return src ? (
    <img
      src={src}
      width={192}
      height={192}
      alt="QR code for your authenticator app"
      className="rounded-lg bg-white p-2"
    />
  ) : (
    <div className="h-48 w-48 animate-pulse rounded-lg bg-surface-2" />
  );
}

/** Enrol / disable TOTP two-factor authentication; recovery codes are shown exactly once. */
export function TwoFactorSettings() {
  const { user, setUser } = useAuth();
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['2fa'],
    queryFn: () => api<{ enabled: boolean; recoveryCodesLeft: number }>('/auth/2fa'),
  });
  const [setup, setSetup] = useState<TwoFactorSetupDto | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);

  const refreshUser = async () => {
    setUser(await api<CurrentUser>('/auth/me'));
    await qc.invalidateQueries({ queryKey: ['2fa'] });
  };

  const start = useMutation({
    mutationFn: () => api<TwoFactorSetupDto>('/auth/2fa/setup', { method: 'POST' }),
    onSuccess: setSetup,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const enable = useMutation({
    mutationFn: () =>
      api<{ recoveryCodes: string[] }>('/auth/2fa/enable', { method: 'POST', body: { code } }),
    onSuccess: async (r) => {
      setCodes(r.recoveryCodes);
      setSetup(null);
      setCode('');
      await refreshUser();
      toast.success('Two-factor authentication is on');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const disable = useMutation({
    mutationFn: () => api('/auth/2fa/disable', { method: 'POST', body: { code } }),
    onSuccess: async () => {
      setCode('');
      await refreshUser();
      toast.success('Two-factor authentication is off');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!user) return null;
  const enabled = user.twoFactorEnabled;

  if (codes) {
    const text = codes.join('\n');
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium">
          Save these recovery codes now. Each works once, and they won't be shown again.
        </p>
        <ul
          className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-3 font-mono"
          aria-label="Recovery codes"
        >
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<Copy className="h-4 w-4" />}
            onClick={() =>
              void navigator.clipboard.writeText(text).then(() => toast.success('Copied'))
            }
          >
            Copy
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<Download className="h-4 w-4" />}
            onClick={() => {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
              a.download = 'devhub-recovery-codes.txt';
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Download
          </Button>
          <Button size="sm" onClick={() => setCodes(null)}>
            I saved them
          </Button>
        </div>
      </div>
    );
  }

  if (setup) {
    return (
      <div className="space-y-3 text-sm">
        <p>
          Scan with Google Authenticator, 1Password, Authy or similar, then enter the 6-digit code.
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <Qr value={setup.otpauthUri} />
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-xs text-muted">
              Can't scan? Enter this key:{' '}
              <code className="break-all font-mono text-fg">{setup.secret}</code>
            </p>
            <Field label="Code from the app">
              {(p) => (
                <Input
                  {...p}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="font-mono tracking-widest"
                />
              )}
            </Field>
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={enable.isPending}
                disabled={!/^\d{6}$/.test(code)}
                onClick={() => enable.mutate()}
              >
                Turn on
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSetup(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-center gap-2">
        Status:{' '}
        {enabled ? (
          <Badge tone="success">
            <ShieldCheck className="h-3 w-3" /> on
          </Badge>
        ) : (
          <Badge>
            <ShieldOff className="h-3 w-3" /> off
          </Badge>
        )}
        {enabled && status.data && (
          <span className="text-xs text-muted">
            {status.data.recoveryCodesLeft} recovery codes left
          </span>
        )}
      </p>
      {enabled ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Code or recovery code to turn off" className="flex-1">
            {(p) => (
              <Input
                {...p}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
              />
            )}
          </Field>
          <Button
            variant="outline"
            loading={disable.isPending}
            disabled={code.trim().length < 6}
            onClick={() => disable.mutate()}
          >
            Turn off
          </Button>
        </div>
      ) : (
        <>
          <p className="text-muted">
            Protect your account with a code from an authenticator app in addition to your password
            (or GitHub/Google sign-in).
          </p>
          <Button size="sm" loading={start.isPending} onClick={() => start.mutate()}>
            Set up two-factor authentication
          </Button>
        </>
      )}
    </div>
  );
}
