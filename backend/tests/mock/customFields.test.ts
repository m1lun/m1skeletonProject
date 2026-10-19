import request from 'supertest';

import { createApp } from '../../src/app';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { ME, bearer } from '../helpers/postFixtures';

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const DOWN = new Error('MongoDB is unreachable');

// Interface GET, POST and DELETE /api/custom-fields
describe('Mocked: /api/custom-fields', () => {
  // Input: GET, POST { label: "Wall width", type: "number" }, and DELETE /wall%20width
  // Expected status code: 500 for each
  // Expected behavior: the error is logged; nothing is stored or removed
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the custom fields store rejects the list, upsert and removal with a database error
  test('Database failure', async () => {
    jest.spyOn(store.customFields, 'list').mockRejectedValue(DOWN);
    jest.spyOn(store.customFields, 'upsert').mockRejectedValue(DOWN);
    jest.spyOn(store.customFields, 'remove').mockRejectedValue(DOWN);
    const auth = bearer(ME);

    const list = await request(app).get('/api/custom-fields').set('Authorization', auth);
    const create = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', auth)
      .send({ label: 'Wall width', type: 'number' });
    const remove = await request(app).delete('/api/custom-fields/wall%20width').set('Authorization', auth);

    expect([list.status, create.status, remove.status]).toEqual([500, 500, 500]);
    expect(remove.body).toEqual({ error: 'Internal Server Error' });
    expect(store.customFields.rows).toHaveLength(0);
  });
});
