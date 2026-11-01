import type { Server } from 'node:http';

import request from 'supertest';

import { env } from '../../src/config/env';
import { ROUTING_TIMEOUT_MS } from '../../src/matching/travelTime';
import { ME, OTHER, bearer, clearDealData, makeListing, makeRequest } from '../helpers/dealFixtures';
import { startTestApp, stopTestApp } from '../helpers/testApp';
import { createTestStore, type TestStore } from '../helpers/testStore';

// NFR 2: without the routing service, the feed still returns its ranked matches within 3 seconds.
const FEED_LIMIT_MS = 3000;

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
  jest.replaceProperty(env, 'orsApiKey', 'test-ors-key');
});

afterEach(() => {
  jest.restoreAllMocks();
});

// A routing service that never answers: the request only ends when the feed's timeout aborts it.
function hangUntilAborted(_input: unknown, init?: Parameters<typeof fetch>[1]): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new Error('aborted'));
    });
  });
}

// Interface GET /api/feed
describe('NFR 2: GET /api/feed without the routing service', () => {
  // Mocked behavior: OpenRouteService never answers
  // Input: the id of my open request, which one listing matches
  // Expected status code: 200
  // Expected behavior: the routing request is abandoned after ROUTING_TIMEOUT_MS, and the feed answers within 3 seconds
  // Expected output: the ranked match with travelMinutes null and travelTimesAvailable false
  test('Routing Service Never Answers', async () => {
    const buyerRequest = await makeRequest(mongo.store, ME);
    const listing = await makeListing(mongo.store, OTHER);
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(hangUntilAborted);

    const started = performance.now();
    const response = await request(app).get(`/api/feed?postId=${buyerRequest.id}`).set('Authorization', bearer(ME));
    const elapsedMs = performance.now() - started;

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      matches: [{ post: { id: listing.id }, travelMinutes: null }],
      travelTimesAvailable: false,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(elapsedMs).toBeGreaterThanOrEqual(ROUTING_TIMEOUT_MS - 50);
    expect(elapsedMs).toBeLessThan(FEED_LIMIT_MS);
  });
});
