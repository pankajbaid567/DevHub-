import { type Prisma } from '@prisma/client';
import type {
  CreateSnippetInput,
  ListSnippetsQuery,
  Paginated,
  SnippetDto,
  SnippetSummaryDto,
  UpdateSnippetInput,
} from '@devhub/shared';
import { createSnippetSchema } from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import type { EventBus } from '../../core/events.js';
import type { AuthUser } from '../../middleware/auth.js';
import { NotFoundError } from '../../core/errors.js';
import { assertCan, policies } from '../../core/policies.js';
import { pageMeta, tagConnect, toUserSummary, userSummarySelect } from '../../core/mappers.js';
import { isUniqueViolation } from '../../core/tx.js';

const include = {
  author: { select: userSummarySelect },
  tags: { select: { name: true } },
  forkedFrom: { select: { id: true, title: true, visibility: true } },
} satisfies Prisma.SnippetInclude;

type Row = Prisma.SnippetGetPayload<{ include: typeof include }>;

function toDto(s: Row, starredByMe: boolean): SnippetDto {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    code: s.code,
    language: s.language,
    tags: s.tags.map((t) => t.name).sort(),
    visibility: s.visibility,
    starCount: s.starCount,
    forkCount: s.forkCount,
    starredByMe,
    // Never leak the title of a private original through a public fork.
    forkedFrom:
      s.forkedFrom && s.forkedFrom.visibility !== 'PRIVATE'
        ? { id: s.forkedFrom.id, title: s.forkedFrom.title }
        : null,
    author: toUserSummary(s.author),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

const PREVIEW_LINES = 12;

/**
 * Visibility rules: PUBLIC is listed and searchable; UNLISTED is readable by anyone with
 * the link but never listed; PRIVATE is visible to the author (and admins) only.
 */
export class SnippetsService {
  constructor(
    private readonly db: Db,
    private readonly events: EventBus,
  ) {}

  async list(q: ListSnippetsQuery, viewer?: AuthUser): Promise<Paginated<SnippetSummaryDto>> {
    const ownList =
      viewer && q.author && q.author.toLowerCase() === (await this.usernameOf(viewer.id));
    const where: Prisma.SnippetWhereInput = ownList ? {} : { visibility: 'PUBLIC' };
    if (q.author) where.author = { username: q.author.toLowerCase() };
    if (q.language) where.language = q.language;
    if (q.tag) where.tags = { some: { name: q.tag } };
    if (q.q) {
      const ids = await this.db.$queryRaw<{ id: string }[]>`
        SELECT id FROM snippets
        WHERE "searchVector" @@ websearch_to_tsquery('english', ${q.q})
        ORDER BY ts_rank_cd("searchVector", websearch_to_tsquery('english', ${q.q})) DESC
        LIMIT 500`;
      where.id = { in: ids.map((r) => r.id) };
    }
    const orderBy: Prisma.SnippetOrderByWithRelationInput[] =
      q.sort === 'stars' ? [{ starCount: 'desc' }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }];

    const [total, rows] = await this.db.$transaction([
      this.db.snippet.count({ where }),
      this.db.snippet.findMany({
        where,
        include,
        orderBy,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    const starred = await this.starredSet(
      viewer,
      rows.map((r) => r.id),
    );
    return {
      items: rows.map((r) => {
        const { code, ...rest } = toDto(r, starred.has(r.id));
        return { ...rest, preview: code.split('\n').slice(0, PREVIEW_LINES).join('\n') };
      }),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  async get(id: string, viewer?: AuthUser): Promise<SnippetDto> {
    const s = await this.db.snippet.findUnique({ where: { id }, include });
    // A private snippet returns 404 (not 403) to others, so its existence is not revealed.
    if (!s || (s.visibility === 'PRIVATE' && !(viewer && policies.canModify(viewer, s.authorId)))) {
      throw new NotFoundError('Snippet');
    }
    const starred = await this.starredSet(viewer, [s.id]);
    return toDto(s, starred.has(s.id));
  }

  async create(user: AuthUser, input: CreateSnippetInput): Promise<SnippetDto> {
    const data = createSnippetSchema.parse(input);
    const s = await this.db.snippet.create({
      data: { ...data, tags: { connectOrCreate: tagConnect(data.tags) }, authorId: user.id },
      include,
    });
    void this.events.emit('content.changed', { kind: 'snippet', id: s.id });
    return toDto(s, false);
  }

  async update(user: AuthUser, id: string, input: UpdateSnippetInput): Promise<SnippetDto> {
    const existing = await this.db.snippet.findUnique({
      where: { id },
      select: { authorId: true },
    });
    if (!existing) throw new NotFoundError('Snippet');
    assertCan(policies.canModify(user, existing.authorId), 'Only the author can edit this snippet');
    const { tags, ...rest } = input;
    const s = await this.db.snippet.update({
      where: { id },
      data: { ...rest, ...(tags && { tags: { set: [], connectOrCreate: tagConnect(tags) } }) },
      include,
    });
    void this.events.emit('content.changed', { kind: 'snippet', id });
    return toDto(s, (await this.starredSet(user, [id])).has(id));
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const existing = await this.db.snippet.findUnique({
      where: { id },
      select: { authorId: true },
    });
    if (!existing) throw new NotFoundError('Snippet');
    assertCan(
      policies.canModify(user, existing.authorId),
      'Only the author can delete this snippet',
    );
    await this.db.snippet.delete({ where: { id } });
    void this.events.emit('content.changed', { kind: 'snippet', id });
  }

  /** Idempotent: starring twice is a no-op, unstarring an unstarred snippet too. */
  async setStar(
    user: AuthUser,
    id: string,
    starred: boolean,
  ): Promise<{ starCount: number; starredByMe: boolean }> {
    const snippet = await this.get(id, user); // enforces visibility
    const result = await this.db.$transaction(async (tx) => {
      if (starred) {
        try {
          await tx.snippetStar.create({ data: { userId: user.id, snippetId: id } });
        } catch (err) {
          if (isUniqueViolation(err)) return { changed: false };
          throw err;
        }
        await tx.snippet.update({ where: { id }, data: { starCount: { increment: 1 } } });
        return { changed: true };
      }
      const { count } = await tx.snippetStar.deleteMany({
        where: { userId: user.id, snippetId: id },
      });
      if (count) await tx.snippet.update({ where: { id }, data: { starCount: { decrement: 1 } } });
      return { changed: count > 0 };
    });
    const { starCount } = await this.db.snippet.findUniqueOrThrow({
      where: { id },
      select: { starCount: true },
    });
    if (starred && result.changed && snippet.author.id !== user.id) {
      void this.events.emit('snippet.starred', {
        snippetId: id,
        title: snippet.title,
        authorId: snippet.author.id,
        actorId: user.id,
      });
    }
    return { starCount, starredByMe: starred };
  }

  async fork(user: AuthUser, id: string): Promise<SnippetDto> {
    const original = await this.get(id, user);
    const [fork] = await this.db.$transaction([
      this.db.snippet.create({
        data: {
          title: original.title.startsWith('Fork of ')
            ? original.title
            : `Fork of ${original.title}`.slice(0, 120),
          description: original.description,
          code: original.code,
          language: original.language,
          visibility: 'PUBLIC',
          forkedFromId: original.id,
          authorId: user.id,
          tags: { connectOrCreate: tagConnect(original.tags) },
        },
        include,
      }),
      this.db.snippet.update({ where: { id }, data: { forkCount: { increment: 1 } } }),
    ]);
    void this.events.emit('content.changed', { kind: 'snippet', id: fork.id });
    return toDto(fork, false);
  }

  private async starredSet(viewer: AuthUser | undefined, ids: string[]): Promise<Set<string>> {
    if (!viewer || ids.length === 0) return new Set();
    const rows = await this.db.snippetStar.findMany({
      where: { userId: viewer.id, snippetId: { in: ids } },
      select: { snippetId: true },
    });
    return new Set(rows.map((r) => r.snippetId));
  }

  private async usernameOf(userId: string): Promise<string | undefined> {
    return (await this.db.user.findUnique({ where: { id: userId }, select: { username: true } }))
      ?.username;
  }
}
