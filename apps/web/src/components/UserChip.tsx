import { Link } from 'react-router-dom';
import type { UserSummary } from '@devhub/shared';
import { Avatar } from './ui/primitives';
import { compact, displayName } from '../lib/utils';

export function UserChip({
  user,
  size = 24,
  meta,
}: {
  user: UserSummary;
  size?: number;
  meta?: string;
}) {
  return (
    <Link to={`/u/${user.username}`} className="group inline-flex items-center gap-2 text-sm">
      <Avatar name={user.displayName ?? user.username} src={user.avatarUrl} size={size} />
      <span className="font-medium text-fg group-hover:text-accent">{displayName(user)}</span>
      <span className="text-xs text-muted" title="Reputation">
        {compact(user.reputation)}
      </span>
      {meta && <span className="text-xs text-muted">· {meta}</span>}
    </Link>
  );
}
