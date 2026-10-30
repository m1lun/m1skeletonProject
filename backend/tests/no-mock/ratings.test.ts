import { createApp } from '../../src/app';
import type { Deal } from '../../src/models/deal';
import {
  ME,
  OTHER,
  STRANGER,
  clearDealData,
  makeDeal,
  makeListing,
  makeRating,
  makeReputation,
  storedRatings,
} from '../helpers/dealFixtures';
import { MemorySessionRepo } from '../helpers/memorySessionRepo';
import { call, rate, type Method } from '../helpers/ratingApi';
import { createTestStore, type TestStore } from '../helpers/testStore';

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

const STARS_ERROR = 'stars must be a whole number from 1 to 5';
const COMMENT_ERROR = 'comment must be text of at most 300 characters';
const BODY_ERROR = 'Request body must be a JSON object';
const SEEDED_STARS = 3;
const SEEDED_COMMENT = 'old comment';
const UNKNOWN_ID = '6ad40b88e74dd3678bfef8f3';

interface TokenCase { label: string; auth: string | null; error: string }
interface RawCase { label: string; raw: string; type: string; status: number; body: unknown }
interface CommentCase { label: string; body: object; comment: string }
interface IdCase { label: string; id: string }
interface RoleCase { label: string; sellerId: string; buyerId: string }

async function dealWithRating(method: Method): Promise<Deal> {
  const listing = await makeListing(mongo.store, ME);
  const deal = await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { listingId: listing.id });
  if (method === 'PUT') {
    await makeRating(mongo.store, {
      dealId: deal.id,
      raterId: ME,
      ratedUserId: OTHER,
      stars: SEEDED_STARS,
      comment: SEEDED_COMMENT,
    });
    await makeReputation(mongo.store, OTHER, [SEEDED_STARS]);
  }
  return deal;
}

async function dataOf(): Promise<unknown> {
  return {
    ratings: await storedRatings(mongo.db),
    other: await mongo.store.reputations.find(OTHER),
    me: await mongo.store.reputations.find(ME),
  };
}

function sharedCases(method: Method): void {
  const status = method === 'POST' ? 201 : 200;

  test.each([
    { label: 'No Token', auth: null, error: 'Missing Authorization: Bearer <session token> header' },
    { label: 'Garbage Token', auth: 'Bearer not-a-token', error: 'Invalid or expired session token' },
  ])('$label: 401', async ({ auth, error }: TokenCase) => {
    const deal = await dealWithRating(method);
    const before = await dataOf();

    const response = await rate(app, method, deal.id, { stars: 4 }, { auth });

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({ error });
    expect(await dataOf()).toStrictEqual(before);
  });

  test.each([
    { label: 'Stars 0', stars: '0' },
    { label: 'Stars 6', stars: '6' },
    { label: 'Stars 4.5', stars: '4.5' },
    { label: 'Stars As Text', stars: '"5"' },
    { label: 'Stars Null', stars: 'null' },
    { label: 'Stars Missing', stars: undefined },
    { label: 'Stars Too Large For JSON', stars: '1e999' },
    { label: 'Stars Operator', stars: '{"$gt":0}' },
  ])('$label: 400', async ({ stars }: { label: string; stars: string | undefined }) => {
    const deal = await dealWithRating(method);
    const before = await dataOf();

    const response = await call(app, method, deal.id, stars === undefined ? '{}' : `{"stars":${stars}}`);

    expect(response.status).toBe(400);
    expect(response.body).toStrictEqual({ error: 'Invalid request', details: [STARS_ERROR] });
    expect(await dataOf()).toStrictEqual(before);
  });

  test.each([
    { label: 'Comment Over 300 Characters', comment: JSON.stringify('x'.repeat(301)) },
    { label: 'Comment As Number', comment: '5' },
    { label: 'Comment Operator', comment: '{"$ne":null}' },
  ])('$label: 400', async ({ comment }: { label: string; comment: string }) => {
    const deal = await dealWithRating(method);
    const before = await dataOf();

    const response = await call(app, method, deal.id, `{"stars":4,"comment":${comment}}`);

    expect(response.status).toBe(400);
    expect(response.body).toStrictEqual({ error: 'Invalid request', details: [COMMENT_ERROR] });
    expect(await dataOf()).toStrictEqual(before);
  });

  test.each([
    { label: 'Body Is An Array', raw: '[{"stars":4}]', type: 'application/json', status: 400, body: { error: 'Invalid request', details: [BODY_ERROR, STARS_ERROR] } },
    { label: 'Body Is Plain Text', raw: 'stars=4', type: 'text/plain', status: 400, body: { error: 'Invalid request', details: [BODY_ERROR, STARS_ERROR] } },
    { label: 'Malformed JSON', raw: '{"stars":', type: 'application/json', status: 400, body: { error: 'Malformed request body' } },
  ])('$label: 400', async ({ raw, type, status: expected, body }: RawCase) => {
    const deal = await dealWithRating(method);
    const before = await dataOf();

    const response = await call(app, method, deal.id, raw, { type });

    expect(response.status).toBe(expected);
    expect(response.body).toStrictEqual(body);
    expect(await dataOf()).toStrictEqual(before);
  });

  test(`Not A Party To The Deal: 403`, async () => {
    const deal = await dealWithRating(method);
    const before = await dataOf();

    const response = await rate(app, method, deal.id, { stars: 4 }, { userId: STRANGER });

    expect(response.status).toBe(403);
    expect(response.body).toStrictEqual({ error: 'Forbidden' });
    expect(await dataOf()).toStrictEqual(before);
  });

  test.each([
    { label: 'Unknown Deal', id: UNKNOWN_ID },
    { label: 'Malformed Id', id: 'nope' },
    { label: 'Twelve Character Id', id: 'aaaaaaaaaaaa' },
  ])('$label: 404', async ({ id }: IdCase) => {
    await dealWithRating(method);
    const before = await dataOf();

    const response = await rate(app, method, id, { stars: 4 });

    expect(response.status).toBe(404);
    expect(response.body).toStrictEqual({ error: 'Not Found' });
    expect(await dataOf()).toStrictEqual(before);
  });

  test.each([
    { label: 'Exactly 300 Characters', body: { stars: 4, comment: 'x'.repeat(300) }, comment: 'x'.repeat(300) },
    { label: 'Surrounding Whitespace Trimmed', body: { stars: 4, comment: '  fine  ' }, comment: 'fine' },
    { label: 'Comment Omitted', body: { stars: 4 }, comment: '' },
  ])('Comment: $label', async ({ body, comment }: CommentCase) => {
    const deal = await dealWithRating(method);

    const response = await rate(app, method, deal.id, body);

    expect(response.status).toBe(status);
    expect(response.body.rating).toMatchObject({ dealId: deal.id, raterId: ME, ratedUserId: OTHER, stars: 4, comment });
    expect(await storedRatings(mongo.db)).toMatchObject([{ comment }]);
  });

  test.each([
    { label: 'Rated User Id', field: 'ratedUserId' },
    { label: 'Rater Id', field: 'raterId' },
    { label: 'Deal Id', field: 'dealId' },
  ])('Unknown Field $label: 400', async ({ field }: { label: string; field: string }) => {
    const deal = await dealWithRating(method);
    const before = await dataOf();

    const response = await rate(app, method, deal.id, { stars: 4, [field]: STRANGER });

    expect(response.status).toBe(400);
    expect(response.body).toStrictEqual({ error: 'Invalid request', details: [`unsupported field "${field}"`] });
    expect(await dataOf()).toStrictEqual(before);
    expect(await mongo.store.reputations.find(STRANGER)).toBeNull();
  });
}

describe('Unmocked: POST /api/deals/:id/ratings', () => {
  sharedCases('POST');

  test.each([
    { label: 'Seller Rates', sellerId: ME, buyerId: OTHER },
    { label: 'Buyer Rates', sellerId: OTHER, buyerId: ME },
  ])('$label The Other Party', async ({ sellerId, buyerId }: RoleCase) => {
    const listing = await makeListing(mongo.store, sellerId);
    const deal = await makeDeal(mongo.store, { sellerId, buyerId }, { listingId: listing.id });
    await makeReputation(mongo.store, OTHER, [5]);

    const response = await rate(app, 'POST', deal.id, { stars: 3, comment: 'Fine' });

    expect(response.status).toBe(201);
    expect(response.body).toStrictEqual({
      rating: {
        id: expect.any(String),
        dealId: deal.id,
        raterId: ME,
        ratedUserId: OTHER,
        stars: 3,
        comment: 'Fine',
        createdAt: expect.any(String),
      },
      otherUser: { id: OTHER, score: 4, ratingCount: 2 },
    });
    expect(await storedRatings(mongo.db)).toMatchObject([{ dealId: deal.id, raterId: ME, ratedUserId: OTHER, stars: 3 }]);
    expect(await mongo.store.reputations.find(OTHER)).toMatchObject({ starSum: 8, ratingCount: 2 });
  });

  test('Second Rating Of The Same Deal: 409', async () => {
    const deal = await dealWithRating('POST');
    await rate(app, 'POST', deal.id, { stars: 5, comment: 'First' });
    const before = await dataOf();

    const response = await rate(app, 'POST', deal.id, { stars: 1, comment: 'Second' });

    expect(response.status).toBe(409);
    expect(response.body).toStrictEqual({ error: 'You already rated this deal' });
    expect(await dataOf()).toStrictEqual(before);
    expect(await storedRatings(mongo.db)).toMatchObject([{ stars: 5, comment: 'First' }]);
  });

  test('Both Parties Rate The Same Deal', async () => {
    const deal = await dealWithRating('POST');

    const mine = await rate(app, 'POST', deal.id, { stars: 5 }, { userId: ME });
    const theirs = await rate(app, 'POST', deal.id, { stars: 2 }, { userId: OTHER });

    expect(mine.status).toBe(201);
    expect(theirs.status).toBe(201);
    expect(theirs.body.otherUser).toStrictEqual({ id: ME, score: 2, ratingCount: 1 });
    expect(await storedRatings(mongo.db)).toMatchObject([
      { raterId: ME, ratedUserId: OTHER, stars: 5 },
      { raterId: OTHER, ratedUserId: ME, stars: 2 },
    ]);
    expect(await mongo.store.reputations.find(OTHER)).toMatchObject({ starSum: 5, ratingCount: 1 });
    expect(await mongo.store.reputations.find(ME)).toMatchObject({ starSum: 2, ratingCount: 1 });
  });
});

describe('Unmocked: PUT /api/deals/:id/ratings', () => {
  sharedCases('PUT');

  test('Change 3 Stars To 5', async () => {
    const deal = await dealWithRating('PUT');
    const [seeded] = await storedRatings(mongo.db);

    const response = await rate(app, 'PUT', deal.id, { stars: 5, comment: 'Better' });

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      rating: {
        id: expect.any(String),
        dealId: deal.id,
        raterId: ME,
        ratedUserId: OTHER,
        stars: 5,
        comment: 'Better',
        createdAt: seeded?.createdAt.toISOString(),
        updatedAt: expect.any(String),
      },
      otherUser: { id: OTHER, score: 5, ratingCount: 1 },
    });
    expect(await mongo.store.reputations.find(OTHER)).toMatchObject({ starSum: 5, ratingCount: 1 });
  });

  test('Same Stars With A New Comment', async () => {
    const deal = await dealWithRating('PUT');
    const before = await mongo.store.reputations.find(OTHER);

    const response = await rate(app, 'PUT', deal.id, { stars: SEEDED_STARS, comment: 'New comment' });

    expect(response.status).toBe(200);
    expect(response.body.rating).toMatchObject({ stars: SEEDED_STARS, comment: 'New comment' });
    expect(response.body.otherUser).toStrictEqual({ id: OTHER, score: SEEDED_STARS, ratingCount: 1 });
    expect(await mongo.store.reputations.find(OTHER)).toStrictEqual(before);
  });

  test('Not Rated Yet: 404', async () => {
    const listing = await makeListing(mongo.store, ME);
    const deal = await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { listingId: listing.id });
    const before = await dataOf();

    const response = await rate(app, 'PUT', deal.id, { stars: 4 });

    expect(response.status).toBe(404);
    expect(response.body).toStrictEqual({ error: 'You have not rated this deal' });
    expect(await dataOf()).toStrictEqual(before);
  });

  test('Cannot Edit The Other Partys Rating', async () => {
    const listing = await makeListing(mongo.store, ME);
    const deal = await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { listingId: listing.id });
    await makeRating(mongo.store, { dealId: deal.id, raterId: OTHER, ratedUserId: ME, stars: 2, comment: 'Theirs' });
    const before = await dataOf();

    const response = await rate(app, 'PUT', deal.id, { stars: 5, comment: 'Hijacked' });

    expect(response.status).toBe(404);
    expect(await dataOf()).toStrictEqual(before);
  });

  test('Two Edits At Once Keep The Score Consistent', async () => {
    const deal = await dealWithRating('PUT');

    const [first, second] = await Promise.all([
      rate(app, 'PUT', deal.id, { stars: 5 }),
      rate(app, 'PUT', deal.id, { stars: 4 }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const [finalRating] = await storedRatings(mongo.db);
    const totals = await mongo.store.ratings.statsFor(OTHER);
    expect(totals).toStrictEqual({ starSum: finalRating?.stars, ratingCount: 1 });
    expect(await mongo.store.reputations.find(OTHER)).toMatchObject(totals);
  });
});
