/**
 * Reputation rules: the single source of truth for the API (which applies them inside
 * the vote transaction) and the web app (which explains them to users).
 */
export const REPUTATION = {
  QUESTION_UPVOTED: 5,
  QUESTION_DOWNVOTED: -2,
  ANSWER_UPVOTED: 10,
  ANSWER_DOWNVOTED: -2,
  ANSWER_ACCEPTED: 15,
  /** Casting a downvote on an answer costs the voter a little, discouraging abuse. */
  DOWNVOTE_COST: -1,
} as const;

/** Minimum reputation needed to downvote (upvotes are open to everyone signed in). */
export const MIN_REPUTATION_TO_DOWNVOTE = 15;

export type ReputationReason =
  'QUESTION_VOTE' | 'ANSWER_VOTE' | 'ANSWER_ACCEPTED' | 'DOWNVOTE_CAST';

export type VoteValue = -1 | 0 | 1;

/** Reputation change for the content author when a vote moves from `from` to `to`. */
export function authorReputationDelta(
  target: 'QUESTION' | 'ANSWER',
  from: VoteValue,
  to: VoteValue,
): number {
  const up = target === 'QUESTION' ? REPUTATION.QUESTION_UPVOTED : REPUTATION.ANSWER_UPVOTED;
  const down = target === 'QUESTION' ? REPUTATION.QUESTION_DOWNVOTED : REPUTATION.ANSWER_DOWNVOTED;
  const worth = (v: VoteValue) => (v === 1 ? up : v === -1 ? down : 0);
  return worth(to) - worth(from);
}

/** Reputation change for the voter (only answer downvotes cost the voter). */
export function voterReputationDelta(
  target: 'QUESTION' | 'ANSWER',
  from: VoteValue,
  to: VoteValue,
): number {
  if (target !== 'ANSWER') return 0;
  const cost = (v: VoteValue) => (v === -1 ? REPUTATION.DOWNVOTE_COST : 0);
  return cost(to) - cost(from);
}
