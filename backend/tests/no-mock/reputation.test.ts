import request from 'supertest';

import { createApp } from '../../src/app';
import { ME, OTHER, bearer, clearDealData, makeReputation } from '../helpers/dealFixtures';
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
});

function getReputation(userId: string, caller = ME): request.Test {
  return request(app).get(`/api/users/${encodeURIComponent(userId)}/reputation`).set('Authorization', bearer(caller));
}

interface TokenCase { label: string; header: string | undefined; error: string }
interface ScoreCase { label: string; stars: number[]; score: number | null; ratingCount: number }

describe('Unmocked: GET /api/users/:id/reputation', () => {
  test.each([
    { label: 'No Token', header: undefined, error: 'Missing Authorization: Bearer <session token> header' },
    { label: 'Garbage Token', header: 'Bearer not-a-token', error: 'Invalid or expired session token' },
  ])('$label: 401', async ({ header, error }: TokenCase) => {
    const call = request(app).get(`/api/users/${OTHER}/reputation`);
    const response = await (header === undefined ? call : call.set('Authorization', header));

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({ error });
  });

  test.each([
    { label: 'Never Rated', stars: [], score: null, ratingCount: 0 },
    { label: 'Whole Average', stars: [5, 3], score: 4, ratingCount: 2 },
    { label: 'Fractional Average', stars: [5, 4], score: 4.5, ratingCount: 2 },
  ])('$label: 200', async ({ stars, score, ratingCount }: ScoreCase) => {
    await makeReputation(mongo.store, OTHER, stars);

    const response = await getReputation(OTHER);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ userId: OTHER, score, ratingCount });
  });
});
