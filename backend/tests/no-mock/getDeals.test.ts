import request from 'supertest';

import { createApp } from '../../src/app';
import type { Deal } from '../../src/models/deal';
import type { Listing } from '../../src/models/listing';
import type { Rating } from '../../src/models/rating';
import type { BuyerRequest } from '../../src/models/request';
import {
  ME,
  OTHER,
  PHOTO_ID,
  STRANGER,
  bearer,
  clearDealData,
  makeDeal,
  makeListing,
  makeRating,
  makeReputation,
  makeRequest,
} from '../helpers/dealFixtures';
import { MemorySessionRepo } from '../helpers/memorySessionRepo';
import { createTestStore, type TestStore } from '../helpers/testStore';

const SECOND_PHOTO_ID = '6ad40b88e74dd3678bfef8f4';

let mongo: TestStore;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  mongo = await createTestStore();
  app = createApp({ sessions: new MemorySessionRepo(), store: mongo.store });
});

afterAll(async () => {
  await mongo.dropAndClose();
});

beforeEach(async () => {
  await clearDealData(mongo.db);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function getDeals(query = '', userId = ME): request.Test {
  return request(app).get(`/api/deals${query}`).set('Authorization', bearer(userId));
}

async function dealOnNewListing(sellerId = ME, buyerId = OTHER): Promise<Deal> {
  const listing = await makeListing(mongo.store, sellerId);
  return makeDeal(mongo.store, { sellerId, buyerId }, { listingId: listing.id });
}

interface DealJson {
  id: string;
  title: string;
  listing: unknown;
  request: unknown;
  otherUser: unknown;
  myRating: unknown;
  theirRating: unknown;
}

function dealsOf(response: request.Response): DealJson[] {
  return (response.body as { deals: DealJson[] }).deals;
}

function ratingJson(rating: Rating): { stars: number; comment: string; createdAt: string } {
  return { stars: rating.stars, comment: rating.comment, createdAt: rating.createdAt.toISOString() };
}

interface TokenCase { label: string; header: string | undefined; error: string }
interface RoleCase {
  label: string;
  sellerId: string;
  buyerId: string;
  role: string;
  otherStars: number[];
  score: number | null;
  ratingCount: number;
}
interface PostsCase { label: string; listing: boolean; request: boolean; title: string }
interface RatedCase { label: string; byMe: boolean; byThem: boolean }
interface GoneCase { label: string; post: 'listings' | 'requests' }
interface QueryCase { label: string; query: string; details: string[] }

const LIMIT_ERROR = 'limit must be a whole number from 1 to 50';
const BEFORE_ERROR = 'before must be the nextCursor from a previous page';

describe('Unmocked: GET /api/deals', () => {
  test.each([
    { label: 'No Token', header: undefined, error: 'Missing Authorization: Bearer <session token> header' },
    { label: 'Garbage Token', header: 'Bearer not-a-token', error: 'Invalid or expired session token' },
  ])('$label: 401', async ({ header, error }: TokenCase) => {
    const call = request(app).get('/api/deals');
    const response = await (header === undefined ? call : call.set('Authorization', header));

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({ error });
  });

  test('No Deals', async () => {
    const response = await getDeals();

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ deals: [], nextCursor: null });
  });

  test.each([
    { label: 'Seller', sellerId: ME, buyerId: OTHER, role: 'seller', otherStars: [], score: null, ratingCount: 0 },
    { label: 'Buyer', sellerId: OTHER, buyerId: ME, role: 'buyer', otherStars: [5, 4], score: 4.5, ratingCount: 2 },
  ])('Caller Is The $label', async ({ sellerId, buyerId, role, otherStars, score, ratingCount }: RoleCase) => {
    const other = role === 'seller' ? buyerId : sellerId;
    await makeReputation(mongo.store, other, otherStars);
    const listing = await makeListing(mongo.store, sellerId);
    const deal = await makeDeal(mongo.store, { sellerId, buyerId }, { listingId: listing.id });

    const response = await getDeals();

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      deals: [
        {
          id: deal.id,
          role,
          agreedPrice: 40,
          createdAt: deal.createdAt.toISOString(),
          title: 'chair',
          listing: { id: listing.id, category: 'chair', price: 40, photoId: PHOTO_ID },
          request: null,
          otherUser: { id: other, score, ratingCount },
          myRating: null,
          theirRating: null,
        },
      ],
      nextCursor: null,
    });
  });

  test('Other Users Deals Are Hidden', async () => {
    await dealOnNewListing(OTHER, STRANGER);

    const response = await getDeals();

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ deals: [], nextCursor: null });
  });

  test('Pages Newest First', async () => {
    const made: Deal[] = [];
    for (let count = 0; count < 5; count += 1) {
      made.push(await dealOnNewListing());
    }
    const newest = made.map((deal) => deal.id).reverse();

    const page1 = await getDeals('?limit=2');
    const page2 = await getDeals(`?limit=2&before=${newest[1]}`);
    const page3 = await getDeals(`?limit=2&before=${newest[3]}`);

    const idsOf = (response: request.Response): string[] => dealsOf(response).map((deal) => deal.id);
    expect(idsOf(page1)).toStrictEqual(newest.slice(0, 2));
    expect(page1.body).toMatchObject({ nextCursor: newest[1] });
    expect(idsOf(page2)).toStrictEqual(newest.slice(2, 4));
    expect(page2.body).toMatchObject({ nextCursor: newest[3] });
    expect(idsOf(page3)).toStrictEqual(newest.slice(4));
    expect(page3.body).toMatchObject({ nextCursor: null });
  });

  test('Page That Fits Exactly', async () => {
    await dealOnNewListing();
    await dealOnNewListing();

    const response = await getDeals('?limit=2');

    expect(response.status).toBe(200);
    expect(dealsOf(response)).toHaveLength(2);
    expect(response.body).toMatchObject({ nextCursor: null });
  });

  test.each([
    { label: 'A Listing And A Request', listing: true, request: true, title: 'chair' },
    { label: 'A Listing Only', listing: true, request: false, title: 'chair' },
    { label: 'A Request Only', listing: false, request: true, title: 'desk' },
  ])('Deal From $label', async ({ listing: withListing, request: withRequest, title }: PostsCase) => {
    const listing: Listing | undefined = withListing ? await makeListing(mongo.store, ME) : undefined;
    const buyerRequest: BuyerRequest | undefined = withRequest
      ? await makeRequest(mongo.store, OTHER, { category: 'desk', photoIds: [PHOTO_ID, SECOND_PHOTO_ID] })
      : undefined;
    await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { listingId: listing?.id, requestId: buyerRequest?.id });

    const response = await getDeals();

    expect(response.status).toBe(200);
    expect(dealsOf(response)).toMatchObject([
      {
        title,
        listing: listing === undefined ? null : { id: listing.id, category: 'chair', price: 40, photoId: PHOTO_ID },
        request: buyerRequest === undefined ? null : { id: buyerRequest.id, category: 'desk', photoId: PHOTO_ID },
      },
    ]);
  });

  test('Request Without A Photo', async () => {
    const buyerRequest = await makeRequest(mongo.store, OTHER, { photoIds: [] });
    await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { requestId: buyerRequest.id });

    const response = await getDeals();

    expect(response.status).toBe(200);
    expect(dealsOf(response)).toMatchObject([{ request: { id: buyerRequest.id, category: 'chair', photoId: null } }]);
  });

  test.each([
    { label: 'Nobody Has Rated', byMe: false, byThem: false },
    { label: 'Only I Rated', byMe: true, byThem: false },
    { label: 'Only They Rated', byMe: false, byThem: true },
    { label: 'Both Rated', byMe: true, byThem: true },
  ])('$label', async ({ byMe, byThem }: RatedCase) => {
    const deal = await dealOnNewListing();
    const mine = byMe
      ? await makeRating(mongo.store, { dealId: deal.id, raterId: ME, ratedUserId: OTHER, stars: 4, comment: 'Smooth' })
      : undefined;
    const theirs = byThem
      ? await makeRating(mongo.store, { dealId: deal.id, raterId: OTHER, ratedUserId: ME, stars: 2, comment: 'Late' })
      : undefined;

    const response = await getDeals();

    expect(response.status).toBe(200);
    expect(dealsOf(response)).toMatchObject([
      {
        myRating: mine === undefined ? null : ratingJson(mine),
        theirRating: theirs === undefined ? null : ratingJson(theirs),
      },
    ]);
  });

  test.each<GoneCase>([
    { label: 'Listing', post: 'listings' },
    { label: 'Request', post: 'requests' },
  ])('Deleted $label', async ({ post }: GoneCase) => {
    const listing = post === 'listings' ? await makeListing(mongo.store, ME) : undefined;
    const buyerRequest = post === 'requests' ? await makeRequest(mongo.store, OTHER) : undefined;
    const deal = await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { listingId: listing?.id, requestId: buyerRequest?.id });
    await mongo.db.collection(post).deleteMany({});

    const response = await getDeals();

    expect(response.status).toBe(200);
    expect(dealsOf(response)).toMatchObject([{ id: deal.id, title: '', listing: null, request: null }]);
  });

  test('Five Queries For Twenty Deals', async () => {
    for (let made = 0; made < 20; made += 1) {
      await dealOnNewListing();
    }
    const reads = [
      jest.spyOn(mongo.store.deals, 'listByUser'),
      jest.spyOn(mongo.store.ratings, 'listByDeals'),
      jest.spyOn(mongo.store.reputations, 'findMany'),
      jest.spyOn(mongo.store.listings, 'findByIds'),
      jest.spyOn(mongo.store.requests, 'findByIds'),
    ];

    const response = await getDeals();

    expect(response.status).toBe(200);
    expect(dealsOf(response)).toHaveLength(20);
    reads.forEach((read) => {
      expect(read).toHaveBeenCalledTimes(1);
    });
  });

  test.each(['1', '50'])('Limit %s Is Allowed', async (limit) => {
    await dealOnNewListing();

    const response = await getDeals(`?limit=${limit}`);

    expect(response.status).toBe(200);
    expect(dealsOf(response)).toHaveLength(1);
  });

  test.each([
    { label: 'Limit 0', query: '?limit=0', details: [LIMIT_ERROR] },
    { label: 'Limit 51', query: '?limit=51', details: [LIMIT_ERROR] },
    { label: 'Limit Not A Number', query: '?limit=abc', details: [LIMIT_ERROR] },
    { label: 'Limit Negative', query: '?limit=-1', details: [LIMIT_ERROR] },
    { label: 'Limit Fractional', query: '?limit=1.5', details: [LIMIT_ERROR] },
    { label: 'Limit Repeated', query: '?limit=1&limit=2', details: [LIMIT_ERROR] },
    { label: 'Before Repeated', query: '?before=nope&before=nope', details: [BEFORE_ERROR] },
    { label: 'Before Not An Id', query: '?before=nope', details: [BEFORE_ERROR] },
    { label: 'Before Operator', query: '?before[$ne]=x', details: ['unsupported parameter "before[$ne]"'] },
    { label: 'Unknown Parameter', query: '?sort=asc', details: ['unsupported parameter "sort"'] },
  ])('$label: 400', async ({ query, details }: QueryCase) => {
    const response = await getDeals(query);

    expect(response.status).toBe(400);
    expect(response.body).toStrictEqual({ error: 'Invalid request', details });
  });
});
