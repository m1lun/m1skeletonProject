import type { Server } from 'node:http';

import type { Store } from '../../src/store/types';
import { ME, OTHER, clearDealData, makeDeal, makeListing, makeRating, makeReputation, storedRatings } from '../helpers/dealFixtures';
import { rate, type Method } from '../helpers/ratingApi';
import { startTestApp, stopTestApp } from '../helpers/testApp';
import { createTestStore, type TestStore } from '../helpers/testStore';

let mongo: TestStore;
let app: Server;

beforeAll(async () => {
  mongo = await createTestStore();
  app = await startTestApp(mongo.store);
});

afterAll(async () => {
  await stopTestApp(app);
  await mongo.dropAndClose();
});

beforeEach(async () => {
  await clearDealData(mongo.db);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const FAILURE = new Error('MongoDB is unreachable');
const SEEDED_STARS = 3;

function rejecting(target: unknown, method: string): jest.SpyInstance {
  const spy = jest.spyOn(target as object, method as never) as unknown as jest.SpyInstance;
  return spy.mockRejectedValue(FAILURE);
}

function callCount(spy: jest.SpyInstance): number {
  return spy.mock.calls.length;
}

interface FailureCase {
  label: string;
  method: Method;
  stars: number;
  install: (store: Store, spies: jest.SpyInstance[]) => void;
  storedStars: number | null;
  starSum: number | null;
}

async function dealFor(method: Method): Promise<string> {
  const listing = await makeListing(mongo.store, ME);
  const deal = await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { listingId: listing.id });
  if (method === 'PUT') {
    await makeRating(mongo.store, { dealId: deal.id, raterId: ME, ratedUserId: OTHER, stars: SEEDED_STARS });
    await makeReputation(mongo.store, OTHER, [SEEDED_STARS]);
  }
  return deal.id;
}

async function runFailure({ method, stars, install, storedStars, starSum }: FailureCase): Promise<void> {
  const dealId = await dealFor(method);
  const spies: jest.SpyInstance[] = [];
  install(mongo.store, spies);

  const response = await rate(app, method, dealId, { stars });

  expect(response.status).toBe(500);
  expect(response.body).toStrictEqual({ error: 'Internal Server Error' });
  expect(spies.map(callCount)).toStrictEqual([1]);

  jest.restoreAllMocks();
  const ratings = await storedRatings(mongo.db);
  expect(ratings.map((rating) => rating.stars)).toStrictEqual(storedStars === null ? [] : [storedStars]);
  const reputation = await mongo.store.reputations.find(OTHER);
  expect(reputation === null ? null : reputation.starSum).toBe(starSum);
}

// Interface POST /api/deals/:id/ratings
describe('Mocked: POST /api/deals/:id/ratings', () => {
  // Mocked behavior: the store method named in each row rejects with Error('MongoDB is unreachable')
  // Input: { stars: 4 } from ME on a deal ME has not rated
  // Expected status code: 500
  // Expected behavior: the error is handled and the method is called once; if reputations.addRating fails the rating stays stored and no reputation is created
  // Expected output: { error: 'Internal Server Error' }
  test.each<FailureCase>([
    {
      label: 'deals.findById',
      method: 'POST',
      stars: 4,
      install: (store, spies) => { spies.push(rejecting(store.deals, 'findById')); },
      storedStars: null,
      starSum: null,
    },
    {
      label: 'ratings.insert',
      method: 'POST',
      stars: 4,
      install: (store, spies) => { spies.push(rejecting(store.ratings, 'insert')); },
      storedStars: null,
      starSum: null,
    },
    {
      label: 'reputations.addRating',
      method: 'POST',
      stars: 4,
      install: (store, spies) => { spies.push(rejecting(store.reputations, 'addRating')); },
      storedStars: 4,
      starSum: null,
    },
  ])('$label Throws: 500', runFailure);
});

// Interface PUT /api/deals/:id/ratings
describe('Mocked: PUT /api/deals/:id/ratings', () => {
  // Mocked behavior: the store method named in each row rejects with Error('MongoDB is unreachable')
  // Input: { stars: 5 } from ME, or { stars: 3 } for reputations.find, when ME rated this deal 3 stars
  // Expected status code: 500
  // Expected behavior: the error is handled and the method is called once; if reputations.changeStars fails the rating has its new stars and the reputation is unchanged
  // Expected output: { error: 'Internal Server Error' }
  test.each<FailureCase>([
    {
      label: 'deals.findById',
      method: 'PUT',
      stars: 5,
      install: (store, spies) => { spies.push(rejecting(store.deals, 'findById')); },
      storedStars: SEEDED_STARS,
      starSum: SEEDED_STARS,
    },
    {
      label: 'ratings.update',
      method: 'PUT',
      stars: 5,
      install: (store, spies) => { spies.push(rejecting(store.ratings, 'update')); },
      storedStars: SEEDED_STARS,
      starSum: SEEDED_STARS,
    },
    {
      label: 'reputations.changeStars',
      method: 'PUT',
      stars: 5,
      install: (store, spies) => { spies.push(rejecting(store.reputations, 'changeStars')); },
      storedStars: 5,
      starSum: SEEDED_STARS,
    },
    {
      label: 'reputations.find',
      method: 'PUT',
      stars: SEEDED_STARS,
      install: (store, spies) => { spies.push(rejecting(store.reputations, 'find')); },
      storedStars: SEEDED_STARS,
      starSum: SEEDED_STARS,
    },
  ])('$label Throws: 500', runFailure);
});
