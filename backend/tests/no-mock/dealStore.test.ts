import { BadRequestError } from '../../src/errors';
import { assertHasPost, otherParty, roleOf, type Deal } from '../../src/models/deal';
import type { Reputation } from '../../src/models/reputation';
import { averageScore, reputationSummary } from '../../src/reputation/score';
import {
  ME,
  OTHER,
  PHOTO_ID,
  clearDealData,
  makeDeal,
  makeListing,
  makeRating,
} from '../helpers/dealFixtures';
import { createTestStore, type TestStore } from '../helpers/testStore';

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

const NOW = new Date('2026-10-01T00:00:00Z');
const SECOND_PHOTO_ID = '6ad40b88e74dd3678bfef8f4';
const SCHEMA_VIOLATION = 121;
const DUPLICATE_KEY = 11000;

type Row = Record<string, unknown>;

const VALID_DEAL: Row = { listingId: 'l1', requestId: null, sellerId: SELLER, buyerId: BUYER, agreedPrice: 50, createdAt: NOW };
const VALID_RATING: Row = { dealId: 'd1', raterId: ME, ratedUserId: OTHER, stars: 4, comment: '', createdAt: NOW };
const VALID_REPUTATION: Row = { userId: OTHER, starSum: 4, ratingCount: 1, updatedAt: NOW };

let mongo: TestStore;

beforeAll(async () => {
  mongo = await createTestStore();
});

afterAll(async () => {
  await mongo.dropAndClose();
});

beforeEach(async () => {
  await clearDealData(mongo.db);
});

function without(row: Row, field: string): Row {
  return Object.fromEntries(Object.entries(row).filter(([name]) => name !== field));
}

async function insertRaw(collection: string, doc: Row): Promise<void> {
  await mongo.db.collection(collection).insertOne({ ...doc });
}

async function countOf(collection: string): Promise<number> {
  return Number(await mongo.db.collection(collection).countDocuments());
}

interface RawCase { label: string; collection: string; doc: Row }
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

// Interface database validators (rules on the collections, not an API)
describe('Unmocked: database validators', () => {
  // Input: a valid rating that has the optional updatedAt, written straight to the collection
  // Expected behavior: the validator accepts it
  // Expected output: the rating is stored
  test('Accepts A Rating With updatedAt', async () => {
    await insertRaw('ratings', { ...VALID_RATING, updatedAt: NOW });

    expect(await countOf('ratings')).toBe(1);
  });

  // Input: documents that break one rule each, written straight to the collection past the store (see table)
  // Expected behavior: the database rejects them and nothing is stored
  // Expected output: error with code 121, document failed validation
  test.each<RawCase>([
    { label: 'Deal With Neither Post', collection: 'deals', doc: { ...VALID_DEAL, listingId: null } },
    { label: 'Deal With A Negative Price', collection: 'deals', doc: { ...VALID_DEAL, agreedPrice: -1 } },
    { label: 'Deal Without A Buyer', collection: 'deals', doc: without(VALID_DEAL, 'buyerId') },
    { label: 'Rating Of 0 Stars', collection: 'ratings', doc: { ...VALID_RATING, stars: 0 } },
    { label: 'Rating Of 6 Stars', collection: 'ratings', doc: { ...VALID_RATING, stars: 6 } },
    { label: 'Rating Of 4.5 Stars', collection: 'ratings', doc: { ...VALID_RATING, stars: 4.5 } },
    { label: 'Rating With A 301 Character Comment', collection: 'ratings', doc: { ...VALID_RATING, comment: 'x'.repeat(301) } },
    { label: 'Reputation With Negative Stars', collection: 'reputations', doc: { ...VALID_REPUTATION, starSum: -1 } },
    { label: 'Reputation With No Ratings', collection: 'reputations', doc: { ...VALID_REPUTATION, ratingCount: 0 } },
  ])('Rejects $label', async ({ collection, doc }: RawCase) => {
    await expect(insertRaw(collection, doc)).rejects.toMatchObject({ code: SCHEMA_VIOLATION });

    expect(await countOf(collection)).toBe(0);
  });
});

// Interface unique indexes (rules on the collections, not an API)
describe('Unmocked: unique indexes', () => {
  // Input: the same document written twice to a collection, under different _ids
  // Expected behavior: the second write is rejected and one document remains
  // Expected output: error with code 11000, duplicate key
  test.each<RawCase>([
    { label: 'Deal On The Same Listing', collection: 'deals', doc: VALID_DEAL },
    { label: 'Deal On The Same Request', collection: 'deals', doc: { ...VALID_DEAL, listingId: null, requestId: 'r1' } },
    { label: 'Reputation For The Same User', collection: 'reputations', doc: VALID_REPUTATION },
  ])('Rejects $label', async ({ collection, doc }: RawCase) => {
    await insertRaw(collection, doc);

    await expect(insertRaw(collection, doc)).rejects.toMatchObject({ code: DUPLICATE_KEY });
    expect(await countOf(collection)).toBe(1);
  });

  // Input: two listing-only deals and two request-only deals
  // Expected behavior: a null post is not unique, so none of the deals collide
  // Expected output: 4 deals stored
  test('Deals Can Share A Missing Post', async () => {
    await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { listingId: 'l1' });
    await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { listingId: 'l2' });
    await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { requestId: 'r1' });
    await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { requestId: 'r2' });

    expect(await countOf('deals')).toBe(4);
  });
});

// Interface deals.insert (store method, not an API)
describe('Unmocked: deals.insert', () => {
  // Input: a deal whose listingId and requestId are both null
  // Expected behavior: the store rejects it before reaching the database
  // Expected output: BadRequestError, nothing stored
  test('Deal With No Post', async () => {
    const deal = { listingId: null, requestId: null, sellerId: SELLER, buyerId: BUYER, agreedPrice: 50, createdAt: NOW };

    await expect(mongo.store.deals.insert(deal)).rejects.toBeInstanceOf(BadRequestError);
    expect(await countOf('deals')).toBe(0);
  });
});

// Interface ratings.listByDeals (store method, not an API)
describe('Unmocked: ratings.listByDeals', () => {
  // Input: the id of one of two rated deals, whose rating has updatedAt set
  // Expected behavior: other deals are left out, and so are ratedUserId and updatedAt
  // Expected output: [{ id, dealId, raterId, stars, comment, createdAt }]
  test('Only The Requested Deals And Fields', async () => {
    const rating = await makeRating(mongo.store, { dealId: 'd1', raterId: ME, ratedUserId: OTHER, stars: 4, comment: 'Good', updatedAt: NOW });
    await makeRating(mongo.store, { dealId: 'd2', raterId: ME, ratedUserId: OTHER, stars: 2 });

    expect(await mongo.store.ratings.listByDeals(['d1'])).toStrictEqual([
      { id: rating.id, dealId: 'd1', raterId: ME, stars: 4, comment: 'Good', createdAt: rating.createdAt },
    ]);
  });
});

// Interface reputations.addRating (store method, not an API)
describe('Unmocked: reputations.addRating', () => {
  // Input: 10 ratings of 3 stars sent at once for a user with no reputation
  // Expected behavior: every rating counts and one reputation exists
  // Expected output: { starSum: 30, ratingCount: 10 }
  test('Ratings At Once For A New User All Count', async () => {
    await Promise.all(Array.from({ length: 10 }, async () => mongo.store.reputations.addRating(OTHER, 3, NOW)));

    expect(await mongo.store.reputations.find(OTHER)).toMatchObject({ starSum: 30, ratingCount: 10 });
    expect(await countOf('reputations')).toBe(1);
  });
});

// Interface reputations.changeStars (store method, not an API)
describe('Unmocked: reputations.changeStars', () => {
  // Input: a delta for a user with no reputation
  // Expected behavior: no reputation is created
  // Expected output: null
  test('Unknown User', async () => {
    expect(await mongo.store.reputations.changeStars(OTHER, 2, NOW)).toBeNull();
    expect(await countOf('reputations')).toBe(0);
  });
});

// Interface listings.findByIds (store method, not an API)
describe('Unmocked: findByIds', () => {
  // Input: only an id that is not a valid ObjectId
  // Expected behavior: the id is skipped and nothing is looked up
  // Expected output: []
  test('Only Malformed Ids', async () => {
    await makeListing(mongo.store, ME);

    expect(await mongo.store.listings.findByIds(['nope'], ['category'])).toStrictEqual([]);
  });

  // Input: a listing with 2 photos, asked for by id plus a malformed id, for category and first photo only
  // Expected behavior: other fields and other listings are left out
  // Expected output: [{ id, category, photoIds: [first photo] }]
  test('Only The Requested Listing, Fields And First Photo', async () => {
    const listing = await makeListing(mongo.store, ME, { photoIds: [PHOTO_ID, SECOND_PHOTO_ID] });
    await makeListing(mongo.store, ME);

    const found = await mongo.store.listings.findByIds([listing.id, 'nope'], ['category', 'photoIds'], true);

    expect(found).toStrictEqual([{ id: listing.id, category: 'chair', photoIds: [PHOTO_ID] }]);
  });
});
