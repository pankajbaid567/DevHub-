import { describe, expect, it } from 'vitest';
import { authorReputationDelta, REPUTATION, voterReputationDelta } from './reputation.js';
import { createQuestionSchema } from './questions.js';
import { tagsSchema } from './common.js';
import { registerSchema } from './auth.js';

describe('authorReputationDelta', () => {
  it('awards an upvote and reverses it when retracted', () => {
    expect(authorReputationDelta('ANSWER', 0, 1)).toBe(REPUTATION.ANSWER_UPVOTED);
    expect(authorReputationDelta('ANSWER', 1, 0)).toBe(-REPUTATION.ANSWER_UPVOTED);
  });

  it('handles switching an upvote to a downvote in one step', () => {
    expect(authorReputationDelta('QUESTION', 1, -1)).toBe(
      REPUTATION.QUESTION_DOWNVOTED - REPUTATION.QUESTION_UPVOTED,
    );
  });

  it('is zero for a repeated identical vote (idempotent)', () => {
    expect(authorReputationDelta('ANSWER', 1, 1)).toBe(0);
    expect(authorReputationDelta('QUESTION', -1, -1)).toBe(0);
  });
});

describe('voterReputationDelta', () => {
  it('charges the voter only for answer downvotes', () => {
    expect(voterReputationDelta('ANSWER', 0, -1)).toBe(REPUTATION.DOWNVOTE_COST);
    expect(voterReputationDelta('ANSWER', -1, 0)).toBe(-REPUTATION.DOWNVOTE_COST);
    expect(voterReputationDelta('QUESTION', 0, -1)).toBe(0);
    expect(voterReputationDelta('ANSWER', 0, 1)).toBe(0);
  });
});

describe('schemas', () => {
  it('normalises and de-duplicates tags', () => {
    expect(tagsSchema.parse(['React', 'react ', 'node.js'])).toEqual(['react', 'node.js']);
  });

  it('rejects more than five tags and invalid characters', () => {
    expect(tagsSchema.safeParse(['a', 'b', 'c', 'd', 'e', 'f']).success).toBe(false);
    expect(tagsSchema.safeParse(['no spaces']).success).toBe(false);
  });

  it('requires at least one tag on a question', () => {
    const r = createQuestionSchema.safeParse({
      title: 'How do I debounce a React hook?',
      body: 'I want to debounce a value inside a custom hook without stale closures.',
      tags: [],
    });
    expect(r.success).toBe(false);
  });

  it('lowercases usernames and emails and enforces a password policy', () => {
    const ok = registerSchema.parse({
      username: 'Ada_L',
      email: 'ADA@Example.com',
      password: 'lovelace1',
    });
    expect(ok.username).toBe('ada_l');
    expect(ok.email).toBe('ada@example.com');
    expect(
      registerSchema.safeParse({ username: 'ada', email: 'a@b.co', password: 'onlyletters' })
        .success,
    ).toBe(false);
  });
});
