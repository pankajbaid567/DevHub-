import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Copy,
  FileText,
  Mail,
  Plus,
  Send,
  Users,
  Zap,
  BarChart3,
  Archive,
} from 'lucide-react';
import type { CandidateStatus } from '@devhub/shared';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { Button } from '../../components/ui/Button';
import { Card, EmptyState, Skeleton } from '../../components/ui/primitives';

const statusColors: Record<CandidateStatus, string> = {
  INVITED: 'bg-blue-500/10 text-blue-400',
  STARTED: 'bg-yellow-500/10 text-yellow-400',
  IN_PROGRESS: 'bg-orange-500/10 text-orange-400',
  SUBMITTED: 'bg-green-500/10 text-green-400',
  EVALUATED: 'bg-emerald-500/10 text-emerald-400',
  EXPIRED: 'bg-muted/10 text-muted',
};

interface AssessmentFull {
  id: string;
  title: string;
  description: string;
  status: string;
  sections: { type: string; title: string; durationMinutes: number }[];
  totalDurationMinutes: number;
  passingScore: number;
  candidateCount: number;
}

interface CandidateDto {
  id: string;
  email: string;
  name: string | null;
  token: string;
  status: CandidateStatus;
  score: number | null;
  maxScore: number | null;
  startedAt: string | null;
  submittedAt: string | null;
  expiresAt: string;
}

export default function AssessmentDetail() {
  const { orgId, assessmentId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useDocumentTitle('Assessment Details');

  const assessmentQuery = useQuery({
    queryKey: ['assessment', orgId, assessmentId],
    queryFn: () => api<AssessmentFull>(`/orgs/${orgId}/assessments/${assessmentId}`),
    enabled: Boolean(orgId && assessmentId),
  });

  const candidatesQuery = useQuery({
    queryKey: ['candidates', orgId, assessmentId],
    queryFn: () => api<{ items: CandidateDto[] }>(`/orgs/${orgId}/assessments/${assessmentId}/candidates`),
    enabled: Boolean(orgId && assessmentId),
  });

  const [showInvite, setShowInvite] = useState(false);
  const [emails, setEmails] = useState('');
  const [expiresHours, setExpiresHours] = useState(72);

  const activateMutation = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/assessments/${assessmentId}/activate`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessment', orgId, assessmentId] });
      toast.success('Assessment activated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const archiveMutation = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/assessments/${assessmentId}/archive`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessment', orgId, assessmentId] });
      toast.success('Assessment archived');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const inviteMutation = useMutation({
    mutationFn: (data: { candidates: { email: string; name?: string }[]; expiresInHours: number }) =>
      api(`/orgs/${orgId}/assessments/${assessmentId}/invites`, { method: 'POST', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates', orgId, assessmentId] });
      toast.success('Candidates invited');
      setEmails('');
      setShowInvite(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const handleInvite = () => {
    const candidates = emails
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean)
      .map((email) => ({ email }));
    if (candidates.length === 0) return toast.error('Enter at least one email');
    inviteMutation.mutate({ candidates, expiresInHours: expiresHours });
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/assess/${token}`);
    toast.success('Link copied');
  };

  const assessment = assessmentQuery.data;
  const candidates = candidatesQuery.data?.items ?? [];

  if (assessmentQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!assessment) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/assessments/${orgId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{assessment.title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>{assessment.sections.length} sections</span>
            <span>{assessment.totalDurationMinutes} min</span>
            <span className={`rounded px-2 py-0.5 text-xs ${
              assessment.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400'
                : assessment.status === 'DRAFT' ? 'bg-yellow-500/10 text-yellow-400'
                : 'bg-muted/10 text-muted'
            }`}>
              {assessment.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {assessment.status === 'DRAFT' && (
            <Button size="sm" onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}>
              <Zap className="mr-1 h-4 w-4" /> Activate
            </Button>
          )}
          {assessment.status === 'ACTIVE' && (
            <Button variant="secondary" size="sm" onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}>
              <Archive className="mr-1 h-4 w-4" /> Archive
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/assessments/${orgId}/a/${assessmentId}/analytics`)}
          >
            <BarChart3 className="mr-1 h-4 w-4" /> Analytics
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-sm text-muted">Candidates</div>
          <div className="text-2xl font-bold">{candidates.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">Submitted</div>
          <div className="text-2xl font-bold text-green-400">
            {candidates.filter((c) => c.status === 'SUBMITTED' || c.status === 'EVALUATED').length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">In Progress</div>
          <div className="text-2xl font-bold text-orange-400">
            {candidates.filter((c) => c.status === 'STARTED' || c.status === 'IN_PROGRESS').length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">Passing Score</div>
          <div className="text-2xl font-bold">{assessment.passingScore}%</div>
        </Card>
      </div>

      {/* Invite section */}
      {assessment.status === 'ACTIVE' && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Invite Candidates</h3>
            <Button size="sm" onClick={() => setShowInvite(!showInvite)}>
              <Plus className="mr-1 h-4 w-4" /> Invite
            </Button>
          </div>
          {showInvite && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Email addresses (comma or newline separated)</label>
                <textarea
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  rows={3}
                  placeholder="john@example.com, jane@example.com"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Link expires in</label>
                  <select
                    value={expiresHours}
                    onChange={(e) => setExpiresHours(Number(e.target.value))}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                  >
                    <option value={24}>24 hours</option>
                    <option value={48}>48 hours</option>
                    <option value={72}>72 hours</option>
                    <option value={168}>1 week</option>
                  </select>
                </div>
                <div className="flex-1" />
                <Button onClick={handleInvite} disabled={inviteMutation.isPending}>
                  <Send className="mr-1.5 h-4 w-4" />
                  {inviteMutation.isPending ? 'Sending...' : 'Send Invites'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Candidate list */}
      <div>
        <h3 className="mb-3 text-lg font-semibold">Candidates</h3>
        {candidatesQuery.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : candidates.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No candidates yet"
          >{assessment.status === 'ACTIVE' ? 'Invite candidates to get started' : 'Activate the assessment first, then invite candidates'}</EmptyState>
        ) : (
          <div className="space-y-2">
            {candidates.map((c) => (
              <Card key={c.id} className="flex items-center gap-4 p-3">
                <Mail className="h-4 w-4 text-muted" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{c.name ?? c.email}</div>
                  {c.name && <div className="text-xs text-muted">{c.email}</div>}
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[c.status]}`}>
                  {c.status.replace('_', ' ')}
                </span>
                {c.score !== null && c.maxScore !== null && (
                  <span className="text-sm font-mono">
                    {c.score}/{c.maxScore}
                    <span className="ml-1 text-xs text-muted">
                      ({Math.round((c.score / c.maxScore) * 100)}%)
                    </span>
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={() => copyLink(c.token)} title="Copy invite link">
                  <Copy className="h-4 w-4" />
                </Button>
                {(c.status === 'SUBMITTED' || c.status === 'EVALUATED') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/assessments/${orgId}/a/${assessmentId}/report/${c.id}`)}
                    title="View report"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
