import type { Logger } from '../lib/logger.js';

/**
 * Domain events (Observer pattern). Services publish facts ("an answer was accepted");
 * subscribers such as notifications react without the publisher knowing about them.
 *
 * Consistency rule (see ADR 0004): anything that must be atomic with the action — counters,
 * reputation — happens inside the service's database transaction. Side effects that may lag
 * a little — notifications, socket pushes, cache invalidation — subscribe to these events,
 * which are published only after the transaction commits.
 */
export interface DomainEvents {
  'answer.created': {
    answerId: string;
    questionId: string;
    questionTitle: string;
    questionAuthorId: string;
    actorId: string;
  };
  'answer.accepted': {
    answerId: string;
    questionId: string;
    questionTitle: string;
    answerAuthorId: string;
    actorId: string;
  };
  'content.upvoted': {
    target: 'QUESTION' | 'ANSWER';
    questionId: string;
    answerId?: string;
    title: string;
    authorId: string;
    actorId: string;
  };
  'snippet.starred': { snippetId: string; title: string; authorId: string; actorId: string };
  'session.started': { sessionId: string; title: string; hostId: string; participantIds: string[] };
  'session.ended': { sessionId: string };
}

type Handler<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => void | Promise<void>;

export class EventBus {
  private readonly handlers = new Map<keyof DomainEvents, Set<Handler<never>>>();

  constructor(private readonly logger: Logger) {}

  on<K extends keyof DomainEvents>(event: K, handler: Handler<K>): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as Handler<never>);
    this.handlers.set(event, set);
    return () => set.delete(handler as Handler<never>);
  }

  /**
   * Fire-and-forget: handlers run concurrently and a failing handler is logged, never
   * propagated, so a notification outage cannot fail the request that caused it.
   * Returns a promise that settles when all handlers finish (awaited in tests).
   */
  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): Promise<void> {
    const set = this.handlers.get(event);
    if (!set?.size) return Promise.resolve();
    // Promise.resolve().then(...) turns a synchronous throw into a rejection, so it is isolated too.
    return Promise.allSettled(
      [...set].map((h) => Promise.resolve().then(() => (h as Handler<K>)(payload))),
    ).then((results) => {
      for (const r of results) {
        if (r.status === 'rejected')
          this.logger.error({ err: r.reason, event }, 'event handler failed');
      }
    });
  }
}
