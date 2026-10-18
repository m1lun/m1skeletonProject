import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createApp } from '../../src/app';
import type { Listing } from '../../src/models/listing';
import type { Store } from '../../src/store/types';
import { MemoryPostCollection } from '../helpers/memoryPostCollection';
import { MemorySessionRepo } from '../helpers/memorySessionRepo';

const JWT_SECRET = process.env.JWT_SECRET ?? '';

const sessionToken = jwt.sign({ email: 'ada@example.com' }, JWT_SECRET, {
  subject: 'user-me',
  issuer: 'matchmarket-backend',
  audience: 'matchmarket-app',
  expiresIn: 60,
});

let listings: MemoryPostCollection<Listing>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  listings = new MemoryPostCollection<Listing>();
  // The feed only reads listings, so the rest of the store is never touched.
  app = createApp({ sessions: new MemorySessionRepo(), store: { listings } as unknown as Store });
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
    jest.spyOn(listings, 'listOpen').mockRejectedValue(new Error('MongoDB is unreachable'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).get('/api/feed/listings').set('Authorization', `Bearer ${sessionToken}`);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
  });
});
