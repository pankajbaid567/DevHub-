import type { PageMeta, UserSummary } from '@devhub/shared';
import type { Prisma } from '@prisma/client';

/** The only user columns ever embedded in other resources: never the email or hash. */
export const userSummarySelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  reputation: true,
} satisfies Prisma.UserSelect;

export type UserSummaryRow = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;

export const toUserSummary = (u: UserSummaryRow): UserSummary => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl,
  reputation: u.reputation,
});

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function pageMeta(page: number, limit: number, total: number): PageMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Plain-text excerpt of markdown for list views. */
export function excerpt(markdown: string, max = 180): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Connect-or-create clause for normalised tags. */
export const tagConnect = (names: string[]) =>
  names.map((name) => ({ where: { name }, create: { name } }));
