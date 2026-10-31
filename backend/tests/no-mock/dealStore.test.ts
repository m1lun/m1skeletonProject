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

// Interface averageScore (internal function, not an API)
describe('Unmocked: averageScore', () => {
  // Input: starSum and ratingCount for a whole and a fractional average
  // Expected behavior: divides the star total by the rating count
  // Expected output: the average, 4 or 3.5
  test.each([
    { label: '8 stars from 2 ratings', starSum: 8, ratingCount: 2, average: 4 },
    { label: '7 stars from 2 ratings', starSum: 7, ratingCount: 2, average: 3.5 },
  ])('Average Of $label', ({ starSum, ratingCount, average }: AverageCase) => {
    expect(averageScore(starSum, ratingCount)).toBe(average);
  });
});

// Interface reputationSummary (internal function, not an API)
describe('Unmocked: reputationSummary', () => {
  // Input: a user id with a null or undefined reputation
  // Expected behavior: a user with no reputation counts as unrated
  // Expected output: { id, score: null, ratingCount: 0 }
  test.each([
    { label: 'null', reputation: null },
    { label: 'undefined', reputation: undefined },
  ])('Unrated User: $label', ({ reputation }: UnratedCase) => {
    expect(reputationSummary('u1', reputation)).toStrictEqual({ id: 'u1', score: null, ratingCount: 0 });
  });

  // Input: a reputation of 9 stars from 2 ratings
  // Expected behavior: score is the average of the ratings
  // Expected output: { id, score: 4.5, ratingCount: 2 }
  test('Rated User', () => {
    expect(reputationSummary('u1', reputationOf(9, 2))).toStrictEqual({ id: 'u1', score: 4.5, ratingCount: 2 });
  });
});

// Interface otherParty and roleOf (internal functions, not APIs)
describe('Unmocked: otherParty and roleOf', () => {
  // Input: a deal and its seller's id or its buyer's id
  // Expected behavior: each side sees their own role and the opposite party
  // Expected output: role and other party's id
  test.each([
    { label: 'seller', userId: SELLER, role: 'seller', other: BUYER },
    { label: 'buyer', userId: BUYER, role: 'buyer', other: SELLER },
  ])('Deal Seen By The $label', ({ userId, role, other }: SideCase) => {
    expect(roleOf(DEAL, userId)).toBe(role);
    expect(otherParty(DEAL, userId)).toBe(other);
  });
});

// Interface assertHasPost (internal function, not an API)
describe('Unmocked: assertHasPost', () => {
  // Input: a listing id and a request id, or either one alone
  // Expected behavior: a deal needs at least one post
  // Expected output: no error
  test.each([
    { label: 'a listing and a request', listingId: 'l1', requestId: 'r1' },
    { label: 'a listing only', listingId: 'l1', requestId: null },
    { label: 'a request only', listingId: null, requestId: 'r1' },
  ])('Accepts $label', ({ listingId, requestId }: PostsCase) => {
    expect(() => {
      assertHasPost({ listingId, requestId });
    }).not.toThrow();
  });

  // Input: both ids null, or both empty
  // Expected behavior: a deal with no post is rejected
  // Expected output: BadRequestError 'a deal needs a listing or a request'
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
