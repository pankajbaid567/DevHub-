import type { ReputationReason } from '../../generated/prisma/client.js';
import type { Tx } from '../../lib/prisma.js';

/**
 * Writes to the reputation ledger and the cached total in the same transaction, so
 * `users.reputation = SUM(reputation_events.delta)` always holds.
 */
export class ReputationService {
  async apply(
    tx: Tx,
    userId: string,
    delta: number,
    reason: ReputationReason,
    refId: string,
  ): Promise<void> {
    if (delta === 0) return;
    await tx.user.update({ where: { id: userId }, data: { reputation: { increment: delta } } });
    await tx.reputationEvent.create({ data: { userId, delta, reason, refId } });
  }
}
