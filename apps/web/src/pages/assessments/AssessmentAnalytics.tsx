import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Users,
  Award,
  Target,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { Button } from '../../components/ui/Button';
import { Card, ErrorState, Skeleton } from '../../components/ui/primitives';

interface Analytics {
  assessmentId: string;
  title: string;
  totalCandidates: number;
  submitted: number;
  averageScore: number;
  medianScore: number;
  passRate: number;
  scoreDistribution: { range: string; count: number }[];
  topCandidates: { email: string; name: string | null; score: number; maxScore: number }[];
}

export default function AssessmentAnalytics() {
  const { orgId, assessmentId } = useParams();
  const navigate = useNavigate();
  useDocumentTitle('Analytics');

  const analyticsQuery = useQuery({
    queryKey: ['analytics', orgId, assessmentId],
    queryFn: () => api<Analytics>(`/orgs/${orgId}/assessments/${assessmentId}/analytics`),
    enabled: Boolean(orgId && assessmentId),
  });

  if (analyticsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (analyticsQuery.error) return <ErrorState message={errorMessage(analyticsQuery.error)} />;

  const data = analyticsQuery.data;
  if (!data) return null;

  const maxCount = Math.max(...data.scoreDistribution.map((d) => d.count), 1);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/assessments/${orgId}/a/${assessmentId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted">{data.title}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Users className="h-4 w-4" /> Total
          </div>
          <div className="text-2xl font-bold">{data.totalCandidates}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Target className="h-4 w-4" /> Submitted
          </div>
          <div className="text-2xl font-bold">{data.submitted}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <TrendingUp className="h-4 w-4" /> Avg Score
          </div>
          <div className="text-2xl font-bold">{data.averageScore}%</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <BarChart3 className="h-4 w-4" /> Median
          </div>
          <div className="text-2xl font-bold">{data.medianScore}%</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Award className="h-4 w-4" /> Pass Rate
          </div>
          <div className="text-2xl font-bold text-green-400">{data.passRate}%</div>
        </Card>
      </div>

      {/* Score distribution */}
      <Card className="p-5">
        <h3 className="mb-4 font-semibold">Score Distribution</h3>
        <div className="flex items-end gap-2" style={{ height: 160 }}>
          {data.scoreDistribution.map((bucket) => (
            <div key={bucket.range} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs text-muted">{bucket.count}</span>
              <div
                className="w-full rounded-t bg-accent/60 transition-all"
                style={{ height: `${(bucket.count / maxCount) * 120}px`, minHeight: bucket.count > 0 ? 4 : 0 }}
              />
              <span className="text-xs text-muted">{bucket.range}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Top candidates */}
      <Card className="p-5">
        <h3 className="mb-4 font-semibold">Top Candidates</h3>
        {data.topCandidates.length === 0 ? (
          <p className="text-sm text-muted">No submissions yet</p>
        ) : (
          <div className="space-y-2">
            {data.topCandidates.map((c, i) => (
              <div key={c.email} className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                  i === 0 ? 'bg-yellow-500/20 text-yellow-400'
                    : i === 1 ? 'bg-gray-400/20 text-gray-400'
                    : i === 2 ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-surface text-muted'
                }`}>
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{c.name ?? c.email}</div>
                  {c.name && <div className="text-xs text-muted">{c.email}</div>}
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold">
                    {Math.round((c.score / c.maxScore) * 100)}%
                  </div>
                  <div className="text-xs text-muted">{c.score}/{c.maxScore}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
