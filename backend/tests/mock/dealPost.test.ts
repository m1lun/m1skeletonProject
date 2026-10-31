import type { Server } from 'node:http';

import request from 'supertest';

import { ME, OTHER, bearer, clearDealData, makeListing, makeRequest } from '../helpers/dealFixtures';
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

// Interface GET /api/feed/listings/:id
describe('Mocked: GET /api/feed/listings/:id', () => {
  // Mocked behavior: listings.findById rejects with Error('MongoDB is unreachable')
  // Input: GET as ME for another user's listing
  // Expected status code: 500
  // Expected behavior: the error is handled, the method is called once, and the listing stays stored
  // Expected output: { error: 'Internal Server Error' }
  test('listings.findById Throws: 500', async () => {
    const listing = await makeListing(mongo.store, OTHER);
    const find = jest.spyOn(mongo.store.listings, 'findById').mockRejectedValue(FAILURE);

    const response = await request(app).get(`/api/feed/listings/${listing.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toStrictEqual({ error: 'Internal Server Error' });
    expect(find).toHaveBeenCalledTimes(1);
    expect(await mongo.db.collection('listings').countDocuments()).toBe(1);
  });
});

// Interface GET /api/feed/requests/:id
describe('Mocked: GET /api/feed/requests/:id', () => {
  // Mocked behavior: requests.findById rejects with Error('MongoDB is unreachable')
  // Input: GET as ME for another user's request
  // Expected status code: 500
  // Expected behavior: the error is handled, the method is called once, and the request stays stored
  // Expected output: { error: 'Internal Server Error' }
  test('requests.findById Throws: 500', async () => {
    const buyerRequest = await makeRequest(mongo.store, OTHER);
    const find = jest.spyOn(mongo.store.requests, 'findById').mockRejectedValue(FAILURE);

    const response = await request(app).get(`/api/feed/requests/${buyerRequest.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toStrictEqual({ error: 'Internal Server Error' });
    expect(find).toHaveBeenCalledTimes(1);
    expect(await mongo.db.collection('requests').countDocuments()).toBe(1);
  });
});
