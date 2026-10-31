import { BadRequestError } from '../../src/errors';
import { assertHasPost, otherParty, roleOf, type Deal } from '../../src/models/deal';
import type { Reputation } from '../../src/models/reputation';
import { averageScore, reputationSummary } from '../../src/reputation/score';

const SELLER = 'seller-1';
const BUYER = 'buyer-1';

const DEAL: Deal = {
  id: 'deal-1',
  listingId: 'listing-1',
  requestId: null,
  sellerId: SELLER,
  buyerId: BUYER,
  agreedPrice: 50,
  createdAt: new Date('2026-10-01T00:00:00Z'),
};

interface AverageCase { label: string; starSum: number; ratingCount: number; average: number }
interface UnratedCase { label: string; reputation: Reputation | null | undefined }
interface SideCase { label: string; userId: string; role: string; other: string }
interface PostsCase { label: string; listingId: string | null; requestId: string | null }

function reputationOf(starSum: number, ratingCount: number): Reputation {
  return { userId: BUYER, starSum, ratingCount, updatedAt: new Date('2026-10-01T00:00:00Z') };
}

describe('Unmocked: averageScore', () => {
  test.each([
    { label: '8 stars from 2 ratings', starSum: 8, ratingCount: 2, average: 4 },
    { label: '7 stars from 2 ratings', starSum: 7, ratingCount: 2, average: 3.5 },
  ])('Average Of $label', ({ starSum, ratingCount, average }: AverageCase) => {
    expect(averageScore(starSum, ratingCount)).toBe(average);
  });
});

describe('Unmocked: reputationSummary', () => {
  test.each([
    { label: 'null', reputation: null },
    { label: 'undefined', reputation: undefined },
  ])('Unrated User: $label', ({ reputation }: UnratedCase) => {
    expect(reputationSummary('u1', reputation)).toStrictEqual({ id: 'u1', score: null, ratingCount: 0 });
  });

  test('Rated User', () => {
    expect(reputationSummary('u1', reputationOf(9, 2))).toStrictEqual({ id: 'u1', score: 4.5, ratingCount: 2 });
  });
});

describe('Unmocked: otherParty and roleOf', () => {
  test.each([
    { label: 'seller', userId: SELLER, role: 'seller', other: BUYER },
    { label: 'buyer', userId: BUYER, role: 'buyer', other: SELLER },
  ])('Deal Seen By The $label', ({ userId, role, other }: SideCase) => {
    expect(roleOf(DEAL, userId)).toBe(role);
    expect(otherParty(DEAL, userId)).toBe(other);
  });
});

describe('Unmocked: assertHasPost', () => {
  test.each([
    { label: 'a listing and a request', listingId: 'l1', requestId: 'r1' },
    { label: 'a listing only', listingId: 'l1', requestId: null },
    { label: 'a request only', listingId: null, requestId: 'r1' },
  ])('Accepts $label', ({ listingId, requestId }: PostsCase) => {
    expect(() => {
      assertHasPost({ listingId, requestId });
    }).not.toThrow();
  });

  test.each([
    { label: 'neither a listing nor a request', listingId: null, requestId: null },
    { label: 'empty ids', listingId: '', requestId: '' },
  ])('Rejects $label', ({ listingId, requestId }: PostsCase) => {
    const call = (): void => {
      assertHasPost({ listingId, requestId });
    };

    expect(call).toThrow(BadRequestError);
    expect(call).toThrow('a deal needs a listing or a request');
  });
});
