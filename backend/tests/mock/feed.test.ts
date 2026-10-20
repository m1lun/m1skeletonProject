import request from 'supertest';

import { createApp } from '../../src/app';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { bearer, ME } from '../helpers/postFixtures';

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Interface GET /api/feed/listings
describe('Mocked: GET /api/feed/listings', () => {
  // Input: GET with a session token
  // Expected status code: 500
  // Expected behavior: the error is logged; database unchanged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the listings store rejects with a database error
  test('Database failure', async () => {
    jest.spyOn(store.listings, 'listOpen').mockRejectedValue(new Error('MongoDB is unreachable'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).get('/api/feed/listings').set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
  });
});

// Interface GET /api/feed/requests
describe('Mocked: GET /api/feed/requests', () => {
  // Input: GET with a session token
  // Expected status code: 500
  // Expected behavior: the error is logged; database unchanged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the requests store rejects with a database error
  test('Database failure', async () => {
    jest.spyOn(store.requests, 'listOpen').mockRejectedValue(new Error('MongoDB is unreachable'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).get('/api/feed/requests').set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
  });
});
