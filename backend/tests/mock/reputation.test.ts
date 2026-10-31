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
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Mocked: GET /api/users/:id/reputation', () => {
  test('reputations.find Throws: 500', async () => {
    await makeReputation(mongo.store, OTHER, [4]);
    const find = jest.spyOn(mongo.store.reputations, 'find').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).get(`/api/users/${OTHER}/reputation`).set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toStrictEqual({ error: 'Internal Server Error' });
    expect(find).toHaveBeenCalledTimes(1);
    expect(await mongo.db.collection('reputations').countDocuments()).toBe(1);
  });
});
