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

const SERVER_ERROR = { error: 'Internal Server Error' };

// Interface GET /api/custom-fields
describe('Mocked: GET /api/custom-fields', () => {
  // Input: GET with a session token
  // Expected status code: 500
  // Expected behavior: the error is logged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the custom fields store rejects the query with a database error
  test('Database failure', async () => {
    jest.spyOn(store.customFields, 'list').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).get('/api/custom-fields').set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });
});

// Interface POST /api/custom-fields
describe('Mocked: POST /api/custom-fields', () => {
  // Input: POST { label: "Wall width", type: "number" }
  // Expected status code: 500
  // Expected behavior: the error is logged; no field is stored
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the custom fields store rejects the upsert with a database error
  test('Database failure', async () => {
    jest.spyOn(store.customFields, 'upsert').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', bearer(ME))
      .send({ label: 'Wall width', type: 'number' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
    expect(store.customFields.rows).toHaveLength(0);
  });
});

// Interface DELETE /api/custom-fields/:key
describe('Mocked: DELETE /api/custom-fields/:key', () => {
  // Input: DELETE /api/custom-fields/wall%20width
  // Expected status code: 500
  // Expected behavior: the error is logged; the field is not removed
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the custom fields store rejects the removal with a database error
  test('Database failure', async () => {
    await store.customFields.upsert({ ownerId: ME, key: 'wall width', label: 'Wall width', type: 'number' });
    jest.spyOn(store.customFields, 'remove').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).delete('/api/custom-fields/wall%20width').set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
    expect(store.customFields.rows).toHaveLength(1);
  });
});
