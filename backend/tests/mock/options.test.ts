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

// Interface GET /api/options
describe('Mocked: GET /api/options', () => {
  // Input: GET ?field=category
  // Expected status code: 500
  // Expected behavior: the error is logged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the options store rejects the query with a database error
  test('Database failure', async () => {
    jest.spyOn(store.options, 'list').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).get('/api/options?field=category').set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
  });
});

// Interface POST /api/options
describe('Mocked: POST /api/options', () => {
  // Input: POST { field: "brand", label: "Trek" }
  // Expected status code: 500
  // Expected behavior: the error is logged; no option is stored
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the options store rejects the insert with a database error
  test('Database failure', async () => {
    jest.spyOn(store.options, 'ensure').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app)
      .post('/api/options')
      .set('Authorization', bearer(ME))
      .send({ field: 'brand', label: 'Trek' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
    expect(store.options.rows).toHaveLength(0);
  });
});
