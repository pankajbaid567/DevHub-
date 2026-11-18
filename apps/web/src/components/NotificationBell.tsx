import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { CursorPage, NotificationDto } from '@devhub/shared';
import { api } from '../lib/api';
import { qk } from '../lib/queryClient';
import { getSocket } from '../lib/socket';
import { cn, timeAgo } from '../lib/utils';
import { Avatar } from './ui/primitives';
import { Button } from './ui/Button';

type Page = CursorPage<NotificationDto> & { unread: number };

/** Live notification centre: initial page over REST, new items pushed over the socket. */
export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const { data } = useQuery({
    queryKey: qk.notifications,
    queryFn: () => api<Page>('/notifications', { query: { limit: 15 } }),
  });

  useEffect(() => {
    const socket = getSocket();
    const onNew = (n: NotificationDto) => {
      qc.setQueryData<Page>(qk.notifications, (old) =>
        old ? { ...old, items: [n, ...old.items].slice(0, 15), unread: old.unread + 1 } : old,
      );
      toast(`${n.actor ? `${n.actor.displayName ?? n.actor.username} ` : ''}${n.message}`, {
        action: { label: 'Open', onClick: () => (window.location.href = n.link) },
      });
    };
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [qc]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      panel.current && !panel.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = useMutation({
    mutationFn: (body: { ids: string[] } | { all: true }) =>
      api<{ unread: number }>('/notifications/read', { method: 'POST', body }),
    onSuccess: (r, body) =>
      qc.setQueryData<Page>(qk.notifications, (old) =>
        old
          ? {
              ...old,
              unread: r.unread,
              items: old.items.map((n) =>
                'all' in body || body.ids.includes(n.id)
                  ? { ...n, readAt: n.readAt ?? new Date().toISOString() }
                  : n,
              ),
            }
          : old,
      ),
  });

  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={panel}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] animate-slide-up overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead.mutate({ all: true })}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {data?.items.length ? (
              data.items.map((n) => (
                <li key={n.id}>
                  <Link
                    to={n.link}
                    onClick={() => {
                      setOpen(false);
                      if (!n.readAt) markRead.mutate({ ids: [n.id] });
                    }}
                    className={cn(
                      'flex gap-3 px-4 py-3 text-sm hover:bg-surface-2',
                      !n.readAt && 'bg-accent-soft/50',
                    )}
                  >
                    {n.actor ? (
                      <Avatar name={n.actor.displayName ?? n.actor.username} size={28} />
                    ) : (
                      <Bell className="h-5 w-5 text-muted" />
                    )}
                    <span className="flex-1">
                      <span className="font-medium">
                        {n.actor?.displayName ?? n.actor?.username}
                      </span>{' '}
                      {n.message}
                      <span className="mt-0.5 block text-xs text-muted">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                    {!n.readAt && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-accent" aria-label="Unread" />
                    )}
                  </Link>
                </li>
              ))
            ) : (
              <li className="px-4 py-10 text-center text-sm text-muted">You're all caught up.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
