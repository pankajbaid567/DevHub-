import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  CheckCircle2,
  Plus,
  Users,
  FileText,
  BarChart3,
  ArrowRight,
  Eye,
  Archive,
} from 'lucide-react';
import type {
  OrgDto,
  AssessmentDto,
} from '@devhub/shared';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { Button } from '../../components/ui/Button';
import { Card, EmptyState, ErrorState, Skeleton } from '../../components/ui/primitives';

export default function AssessmentDashboard() {
  useDocumentTitle('Assessment Dashboard');
  const { orgId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: ['orgs'],
    queryFn: () => api<{ items: OrgDto[] }>('/orgs'),
  });

  const assessmentsQuery = useQuery({
    queryKey: ['assessments', orgId],
    queryFn: () => api<{ items: AssessmentDto[] }>(`/orgs/${orgId}/assessments`),
    enabled: Boolean(orgId),
  });

  const [_showCreateOrg, setShowCreateOrg] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  const createOrg = useMutation({
    mutationFn: (data: { name: string; slug: string }) =>
      api<OrgDto>('/orgs', { method: 'POST', body: data }),
    onSuccess: (org) => {
      qc.invalidateQueries({ queryKey: ['orgs'] });
      toast.success('Organization created');
      navigate(`/assessments/${org.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const selectedOrg = orgsQuery.data?.items?.find((o) => o.id === orgId);

  if (orgsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (orgsQuery.error) return <ErrorState message={errorMessage(orgsQuery.error)} />;

  const orgs = orgsQuery.data?.items ?? [];

  if (!orgId && orgs.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <h1 className="text-2xl font-bold">Assessment Platform</h1>
        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-accent" />
            <div>
              <h2 className="text-lg font-semibold">Create Your Organization</h2>
              <p className="text-sm text-muted">
                Set up your company to create assessments, invite candidates, and track results.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Organization Name</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => {
                  setOrgName(e.target.value);
                  setOrgSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, ''),
                  );
                }}
                placeholder="Acme Corp"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">URL Slug</label>
              <input
                type="text"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                placeholder="acme-corp"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </div>
            <Button
              onClick={() => createOrg.mutate({ name: orgName, slug: orgSlug })}
              disabled={!orgName.trim() || !orgSlug.trim() || createOrg.isPending}
              className="w-full"
            >
              {createOrg.isPending ? 'Creating...' : 'Create Organization'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!orgId && orgs.length > 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Your Organizations</h1>
          <Button size="sm" onClick={() => setShowCreateOrg(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New Organization
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {orgs.map((org) => (
            <Link key={org.id} to={`/assessments/${org.id}`}>
              <Card className="flex items-center gap-4 p-4 transition-colors hover:bg-surface-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Building2 className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{org.name}</h3>
                  <div className="flex items-center gap-3 text-sm text-muted">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {org.memberCount} members
                    </span>
                    <span>Role: {org.myRole.toLowerCase()}</span>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted" />
              </Card>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const assessments = assessmentsQuery.data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Link to="/assessments" className="hover:text-foreground">
              Organizations
            </Link>
            <span>/</span>
            <span>{selectedOrg?.name ?? 'Loading...'}</span>
          </div>
          <h1 className="text-2xl font-bold">{selectedOrg?.name ?? ''} Assessments</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/assessments/${orgId}/team`)}>
            <Users className="mr-1.5 h-4 w-4" /> Team
          </Button>
          <Button size="sm" onClick={() => navigate(`/assessments/${orgId}/new`)}>
            <Plus className="mr-1.5 h-4 w-4" /> New Assessment
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-sm text-muted">Total Assessments</div>
          <div className="text-2xl font-bold">{assessments.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">Active</div>
          <div className="text-2xl font-bold text-green-400">
            {assessments.filter((a) => a.status === 'ACTIVE').length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">Total Candidates</div>
          <div className="text-2xl font-bold">
            {assessments.reduce((s, a) => s + a.candidateCount, 0)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">Draft</div>
          <div className="text-2xl font-bold text-yellow-400">
            {assessments.filter((a) => a.status === 'DRAFT').length}
          </div>
        </Card>
      </div>

      {/* Assessment list */}
      {assessmentsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : assessments.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No assessments yet"
        >Create your first assessment to start evaluating candidates</EmptyState>
      ) : (
        <div className="space-y-3">
          {assessments.map((a) => (
            <Card
              key={a.id}
              className="flex items-center gap-4 p-4 transition-colors hover:bg-surface-2"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  a.status === 'ACTIVE'
                    ? 'bg-green-500/10 text-green-400'
                    : a.status === 'DRAFT'
                      ? 'bg-yellow-500/10 text-yellow-400'
                      : 'bg-muted/10 text-muted'
                }`}
              >
                {a.status === 'ACTIVE' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : a.status === 'DRAFT' ? (
                  <FileText className="h-5 w-5" />
                ) : (
                  <Archive className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1">
                <Link
                  to={`/assessments/${orgId}/a/${a.id}`}
                  className="font-semibold hover:text-accent"
                >
                  {a.title}
                </Link>
                <div className="flex items-center gap-4 text-sm text-muted">
                  <span>{a.sections.length} section{a.sections.length !== 1 ? 's' : ''}</span>
                  <span>{a.totalDurationMinutes} min</span>
                  <span>{a.candidateCount} candidates</span>
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                    {a.status}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/assessments/${orgId}/a/${a.id}`)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/assessments/${orgId}/a/${a.id}/analytics`)}
                >
                  <BarChart3 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
