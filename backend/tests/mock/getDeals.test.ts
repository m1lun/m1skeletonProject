import request from 'supertest';

import { createApp } from '../../src/app';
import type { Store } from '../../src/store/types';
import { ME, OTHER, bearer, clearDealData, makeDeal, makeListing, makeRequest } from '../helpers/dealFixtures';
import { MemorySessionRepo } from '../helpers/memorySessionRepo';
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
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const FAILURE = new Error('MongoDB is unreachable');

interface ReadCase {
  label: string;
  install: (store: Store, spies: jest.SpyInstance[]) => void;
}

function rejecting(target: unknown, method: string): jest.SpyInstance {
  const spy = jest.spyOn(target as object, method as never) as unknown as jest.SpyInstance;
  return spy.mockRejectedValue(FAILURE);
}

describe('Mocked: GET /api/deals', () => {
  test.each<ReadCase>([
    { label: 'deals.listByUser', install: (store, spies) => { spies.push(rejecting(store.deals, 'listByUser')); } },
    { label: 'ratings.listByDeals', install: (store, spies) => { spies.push(rejecting(store.ratings, 'listByDeals')); } },
    { label: 'reputations.findMany', install: (store, spies) => { spies.push(rejecting(store.reputations, 'findMany')); } },
    { label: 'listings.findByIds', install: (store, spies) => { spies.push(rejecting(store.listings, 'findByIds')); } },
    { label: 'requests.findByIds', install: (store, spies) => { spies.push(rejecting(store.requests, 'findByIds')); } },
  ])('$label Throws: 500', async ({ install }: ReadCase) => {
    const listing = await makeListing(mongo.store, ME);
    const buyerRequest = await makeRequest(mongo.store, OTHER);
    const deal = await makeDeal(
      mongo.store,
      { sellerId: ME, buyerId: OTHER },
      { listingId: listing.id, requestId: buyerRequest.id }
    );
    const spies: jest.SpyInstance[] = [];
    install(mongo.store, spies);

    const response = await request(app).get('/api/deals').set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toStrictEqual({ error: 'Internal Server Error' });
    expect(spies).toHaveLength(1);
    expect(spies[0]).toHaveBeenCalledTimes(1);
    expect(await mongo.db.collection('deals').countDocuments()).toBe(1);
    expect(await mongo.store.deals.findById(deal.id)).toStrictEqual(deal);

    jest.restoreAllMocks();
    const next = await request(app).get('/api/deals').set('Authorization', bearer(ME));
    expect(next.status).toBe(200);
  });
});
