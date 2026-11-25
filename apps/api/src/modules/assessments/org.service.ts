import type { OrgRole } from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors.js';
import { ErrorCode } from '@devhub/shared';

export class OrgService {
  constructor(private readonly db: Db) {}

  async create(userId: string, input: { name: string; slug: string; logoUrl?: string | null }) {
    try {
      return await this.db.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: { name: input.name, slug: input.slug, logoUrl: input.logoUrl ?? null },
        });
        await tx.orgMember.create({
          data: { orgId: org.id, userId, role: 'OWNER' },
        });
        return { ...org, memberCount: 1, myRole: 'OWNER' as OrgRole };
      });
    } catch (e: any) {
      if (e.code === 'P2002') throw new ConflictError('Organization slug already taken');
      throw e;
    }
  }

  async list(userId: string) {
    const memberships = await this.db.orgMember.findMany({
      where: { userId },
      include: {
        org: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      logoUrl: m.org.logoUrl,
      createdAt: m.org.createdAt.toISOString(),
      memberCount: m.org._count.members,
      myRole: m.role as OrgRole,
    }));
  }

  async get(userId: string, orgId: string) {
    const member = await this.db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
      include: {
        org: {
          include: { _count: { select: { members: true } } },
        },
      },
    });
    if (!member) throw new NotFoundError('Organization not found');
    return {
      id: member.org.id,
      name: member.org.name,
      slug: member.org.slug,
      logoUrl: member.org.logoUrl,
      createdAt: member.org.createdAt.toISOString(),
      memberCount: member.org._count.members,
      myRole: member.role as OrgRole,
    };
  }

  async members(userId: string, orgId: string) {
    await this.requireRole(userId, orgId, ['OWNER', 'ADMIN', 'INTERVIEWER', 'VIEWER']);
    const members = await this.db.orgMember.findMany({
      where: { orgId },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, reputation: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return members.map((m) => ({
      user: m.user,
      role: m.role as OrgRole,
      joinedAt: m.joinedAt.toISOString(),
    }));
  }

  async inviteMember(userId: string, orgId: string, email: string, role: OrgRole) {
    await this.requireRole(userId, orgId, ['OWNER', 'ADMIN']);
    const target = await this.db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!target) throw new NotFoundError('User not found — they must register first');
    const existing = await this.db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: target.id } },
    });
    if (existing) throw new ConflictError('User is already a member');

    await this.db.orgMember.create({
      data: { orgId, userId: target.id, role },
    });
    return { success: true };
  }

  async removeMember(userId: string, orgId: string, targetUserId: string) {
    await this.requireRole(userId, orgId, ['OWNER', 'ADMIN']);
    if (userId === targetUserId) throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Cannot remove yourself');
    const target = await this.db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundError('Member not found');
    if (target.role === 'OWNER') throw new ForbiddenError('Cannot remove the owner');

    await this.db.orgMember.delete({ where: { orgId_userId: { orgId, userId: targetUserId } } });
    return { success: true };
  }

  async requireRole(userId: string, orgId: string, roles: OrgRole[]) {
    const member = await this.db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!member) throw new NotFoundError('Organization not found');
    if (!roles.includes(member.role as OrgRole)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    return member;
  }
}
