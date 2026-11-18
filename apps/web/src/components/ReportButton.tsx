import { useState } from 'react';
import { Flag } from 'lucide-react';
import { toast } from 'sonner';
import { REPORT_REASONS, type ReportReason, type ReportTarget } from '@devhub/shared';
import { useAuth } from '../auth/context';
import { api, ApiError, errorMessage } from '../lib/api';
import { Button } from './ui/Button';
import { Dialog } from './ui/primitives';
import { Textarea } from './ui/Field';

const LABELS: Record<ReportReason, string> = {
  SPAM: 'Spam or self-promotion',
  ABUSE: 'Rude or abusive',
  OFF_TOPIC: 'Not about software development',
  PLAGIARISM: 'Copied without attribution',
  OTHER: 'Something else',
};

/** "Report" for signed-in users who are not the author; a moderator reviews every report. */
export function ReportButton({
  targetType,
  targetId,
  authorId,
}: {
  targetType: ReportTarget;
  targetId: string;
  authorId: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('SPAM');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user || user.id === authorId) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await api('/reports', {
        method: 'POST',
        body: { targetType, targetId, reason, ...(details.trim() && { details: details.trim() }) },
      });
      toast.success('Thanks. A moderator will review it.');
      setOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.info('You already reported this');
        setOpen(false);
      } else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        icon={<Flag className="h-3.5 w-3.5" />}
        aria-label={`Report this ${targetType.toLowerCase()}`}
      >
        Report
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Report this ${targetType.toLowerCase()}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} loading={busy}>
              Send report
            </Button>
          </>
        }
      >
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">What's wrong?</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="reason"
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              {LABELS[r]}
            </label>
          ))}
        </fieldset>
        <Textarea
          className="mt-3"
          rows={3}
          maxLength={500}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Optional details for the moderator"
          aria-label="Details"
        />
      </Dialog>
    </>
  );
}
