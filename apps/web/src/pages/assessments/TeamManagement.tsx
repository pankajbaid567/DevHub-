import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Crown,
  Shield,
  Trash2,
  UserPlus,
  Users,
  Eye,
} from 'lucide-react';
import type { OrgRole } from '@devhub/shared';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { Button } from '../../components/ui/Button';
import { Avatar, Card, EmptyState, Skeleton } from '../../components/ui/primitives';

const roleIcons: Record<string, typeof Crown> = {
  OWNER: Crown,
  ADMIN: Shield,
  INTERVIEWER: Users,
  VIEWER: Eye,
};

const roleColors: Record<string, string> = {
  OWNER: 'text-yellow-400',
  ADMIN: 'text-blue-400',
  INTERVIEWER: 'text-green-400',
  VIEWER: 'text-muted',
};

interface MemberDto {
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  role: OrgRole;
  joinedAt: string;
}

export default function TeamManagement() {
  useDocumentTitle('Team');
  const { orgId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => api<{ items: MemberDto[] }>(`/orgs/${orgId}/members`),
    enabled: Boolean(orgId),
  });

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('INTERVIEWER');
  const [showInvite, setShowInvite] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; role: OrgRole }) =>
      api(`/orgs/${orgId}/members`, { method: 'POST', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] });
      toast.success('Member invited');
      setInviteEmail('');
      setShowInvite(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      api(`/orgs/${orgId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] });
      toast.success('Member removed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const members = membersQuery.data?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/assessments/${orgId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Team Members</h1>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setShowInvite(!showInvite)}>
          <UserPlus className="mr-1.5 h-4 w-4" /> Invite
        </Button>
      </div>

      {showInvite && (
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">Invite Team Member</h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email address"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as OrgRole)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            >
              <option value="ADMIN">Admin</option>
              <option value="INTERVIEWER">Interviewer</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <Button
              onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
              disabled={!inviteEmail.trim() || inviteMutation.isPending}
            >
              {inviteMutation.isPending ? 'Inviting...' : 'Send Invite'}
            </Button>
          </div>
          <p className="text-xs text-muted">
            The person must have a DevHub+ account. They'll see the organization in their dashboard.
          </p>
        </Card>
      )}

      {membersQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <EmptyState icon={<Users />} title="No members">Invite your team to get started</EmptyState>
      ) : (
        <div className="space-y-2">
          {members.map((m) => {
            const RoleIcon = roleIcons[m.role] ?? Users;
            return (
              <Card key={m.user.id} className="flex items-center gap-4 p-4">
                <Avatar
                  name={m.user.displayName ?? m.user.username}
                  src={m.user.avatarUrl}
                  size={40}
                />
                <div className="flex-1">
                  <div className="font-medium">
                    {m.user.displayName ?? m.user.username}
                  </div>
                  <div className="text-sm text-muted">@{m.user.username}</div>
                </div>
                <div className={`flex items-center gap-1.5 text-sm ${roleColors[m.role]}`}>
                  <RoleIcon className="h-4 w-4" />
                  {m.role.charAt(0) + m.role.slice(1).toLowerCase()}
                </div>
                {m.role !== 'OWNER' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMutation.mutate(m.user.id)}
                    disabled={removeMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
