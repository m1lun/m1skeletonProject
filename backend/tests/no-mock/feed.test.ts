import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createApp } from '../../src/app';
import type { Listing } from '../../src/models/listing';
import type { Store } from '../../src/store/types';
import { MemoryPostCollection, newListing } from '../helpers/memoryPostCollection';
import { MemorySessionRepo } from '../helpers/memorySessionRepo';

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const ME = 'user-me';
const SELLER = 'user-seller';

// A session token for userId, as /api/auth/google would issue it.
function bearer(userId: string): string {
  const token = jwt.sign({ email: `${userId}@example.com` }, JWT_SECRET, {
    subject: userId,
    issuer: 'matchmarket-backend',
    audience: 'matchmarket-app',
    expiresIn: 60,
  });
  return `Bearer ${token}`;
}

interface FeedBody {
  listings: Listing[];
  nextCursor: string | null;
}

// Each test starts from an empty listings collection, adds the listings it
// needs, and the collection is thrown away afterwards.
let listings: MemoryPostCollection<Listing>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  listings = new MemoryPostCollection<Listing>();
  // The feed only reads listings, so the rest of the store is never touched.
  app = createApp({ sessions: new MemorySessionRepo(), store: { listings } as unknown as Store });
});

// Interface GET /api/feed/listings
describe('Unmocked: GET /api/feed/listings', () => {
  // Input: GET with a session token; the store holds two open listings from another
  //   user, one of the caller's own listings and a closed listing
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: { listings: [the two open listings from the other user, newest first], nextCursor: null }
  test('Lists open listings from other users, newest first', async () => {
    const older = await listings.insert(newListing(SELLER, { description: 'Older desk' }));
    const newer = await listings.insert(newListing(SELLER, { description: 'Newer chair' }));
    await listings.insert(newListing(ME, { description: 'My own lamp' }));
    await listings.insert(newListing(SELLER, { description: 'Sold sofa', status: 'closed' }));

    const response = await request(app).get('/api/feed/listings').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    const body = response.body as FeedBody;
    expect(body.listings.map((listing) => listing.id)).toEqual([newer.id, older.id]);
    expect(body.nextCursor).toBeNull();
    expect(await listings.listByOwner(SELLER)).toHaveLength(3);
    expect(await listings.listByOwner(ME)).toHaveLength(1);
  });

  // Input: GET ?limit=2, then GET ?limit=2&before=<nextCursor>; the store holds three
  //   open listings from another user
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: first page: the two newest listings and a nextCursor;
  //   second page: the oldest listing and nextCursor null
  test('Pages with limit and before', async () => {
    const first = await listings.insert(newListing(SELLER));
    const second = await listings.insert(newListing(SELLER));
    const third = await listings.insert(newListing(SELLER));

    const page1 = await request(app).get('/api/feed/listings?limit=2').set('Authorization', bearer(ME));

    expect(page1.status).toBe(200);
    const body1 = page1.body as FeedBody;
    expect(body1.listings.map((listing) => listing.id)).toEqual([third.id, second.id]);
    expect(body1.nextCursor).toBe(second.id);

    const page2 = await request(app)
      .get(`/api/feed/listings?limit=2&before=${second.id}`)
      .set('Authorization', bearer(ME));

    expect(page2.status).toBe(200);
    const body2 = page2.body as FeedBody;
    expect(body2.listings.map((listing) => listing.id)).toEqual([first.id]);
    expect(body2.nextCursor).toBeNull();
  });

  // Input: GET with a session token; the store holds no listings
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: { listings: [], nextCursor: null }
  test('Empty feed', async () => {
    const response = await request(app).get('/api/feed/listings').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ listings: [], nextCursor: null });
  });

  // Input: GET ?limit=51 (above the maximum page size)
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: ["limit must be a whole number from 1 to 50"] }
  test('Limit too large', async () => {
    const response = await request(app).get('/api/feed/listings?limit=51').set('Authorization', bearer(ME));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid request',
      details: ['limit must be a whole number from 1 to 50'],
    });
  });

  // Input: GET ?limit=abc
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: ["limit must be a whole number from 1 to 50"] }
  test('Limit not a number', async () => {
    const response = await request(app).get('/api/feed/listings?limit=abc').set('Authorization', bearer(ME));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid request',
      details: ['limit must be a whole number from 1 to 50'],
    });
  });

  // Input: GET ?before=not-an-id
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: ["before must be the nextCursor from a previous page"] }
  test('Invalid before cursor', async () => {
    const response = await request(app).get('/api/feed/listings?before=not-an-id').set('Authorization', bearer(ME));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid request',
      details: ['before must be the nextCursor from a previous page'],
    });
  });

  // Input: GET with no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected before reaching the feed
  // Expected output: error message naming the missing header
  test('Not signed in', async () => {
    const response = await request(app).get('/api/feed/listings');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing Authorization: Bearer <session token> header' });
  });
});
