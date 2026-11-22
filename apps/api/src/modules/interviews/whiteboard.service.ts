import type { WhiteboardDto } from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import { NotFoundError } from '../../core/errors.js';

export class WhiteboardService {
  constructor(private readonly db: Db) {}

  async list(userId: string): Promise<WhiteboardDto[]> {
    const rows = await this.db.whiteboard.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return rows.map(toDto);
  }

  async get(userId: string, id: string): Promise<WhiteboardDto> {
    const row = await this.db.whiteboard.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError('Whiteboard');
    return toDto(row);
  }

  async create(
    userId: string,
    input: { title: string; data: Record<string, unknown>; sessionId?: string },
  ): Promise<WhiteboardDto> {
    const row = await this.db.whiteboard.create({
      data: { userId, title: input.title, data: input.data as any, sessionId: input.sessionId },
    });
    return toDto(row);
  }

  async update(
    userId: string,
    id: string,
    input: { title?: string; data?: Record<string, unknown> },
  ): Promise<WhiteboardDto> {
    const existing = await this.db.whiteboard.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError('Whiteboard');
    const row = await this.db.whiteboard.update({
      where: { id },
      data: { ...(input.title !== undefined && { title: input.title }), ...(input.data !== undefined && { data: input.data as any }) },
    });
    return toDto(row);
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.db.whiteboard.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError('Whiteboard');
    await this.db.whiteboard.delete({ where: { id } });
  }
}

function toDto(r: {
  id: string;
  title: string;
  data: unknown;
  sessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WhiteboardDto {
  return {
    id: r.id,
    title: r.title,
    data: r.data as Record<string, unknown>,
    sessionId: r.sessionId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
