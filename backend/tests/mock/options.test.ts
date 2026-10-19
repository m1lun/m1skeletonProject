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

describe('Mocked: GET /api/options', () => {
  test('Database failure', async () => {
    jest.spyOn(store.options, 'list').mockRejectedValue(DOWN);

    const response = await request(app).get('/api/options?field=category').set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
  });
});

describe('Mocked: POST /api/options', () => {
  test('Database failure', async () => {
    jest.spyOn(store.options, 'ensure').mockRejectedValue(DOWN);

    const response = await request(app)
      .post('/api/options')
      .set('Authorization', bearer(ME))
      .send({ field: 'brand', label: 'Trek' });

    expect(response.status).toBe(500);
    expect(store.options.rows).toHaveLength(0);
  });
});
