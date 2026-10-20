import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createApp } from '../../src/app';
import type { GeoPoint } from '../../src/models/common';
import type { Listing } from '../../src/models/listing';
import type { BuyerRequest } from '../../src/models/request';
import type { Store } from '../../src/store/types';
import { MemoryPostCollection, newListing, newRequest } from '../helpers/memoryPostCollection';
import { MemorySessionRepo } from '../helpers/memorySessionRepo';

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const ME = 'user-me';
const OTHER = 'user-other';

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

// newRequest and newListing are at this point; 0.01° of latitude is about 1.1 km.
function north(degrees: number): GeoPoint {
  return { type: 'Point', coordinates: [-123.25, 49.26 + degrees] };
}

interface MatchBody {
  matches: { post: { id: string }; score: number; distanceKm: number; travelMinutes: number | null }[];
  nextCursor: string | null;
}

// Each test starts from empty collections, adds the posts it needs, and they are
// thrown away afterwards.
let listings: MemoryPostCollection<Listing>;
let requests: MemoryPostCollection<BuyerRequest>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  listings = new MemoryPostCollection<Listing>();
  requests = new MemoryPostCollection<BuyerRequest>();
  // The feed only reads posts, so the rest of the store is never touched.
  app = createApp({ sessions: new MemorySessionRepo(), store: { listings, requests } as unknown as Store });
});

function getFeed(query: string, userId = ME): request.Test {
  return request(app).get(`/api/feed${query}`).set('Authorization', bearer(userId));
}

// Interface GET /api/feed
describe('Unmocked: GET /api/feed', () => {
  // Input: GET ?postId=<my request for furniture up to $100, 10 km radius>; the store holds
  //   a cheap nearby listing, a dearer nearby listing, one over the max price, one in
  //   another category, one 11 km away, a closed one and one of my own
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: { matches: [cheap, dearer] best first, each with a score, distanceKm
  //   and travelMinutes null; nextCursor: null }
  test('Buyer feed: listings that meet the request, best first', async () => {
    const mine = await requests.insert(newRequest(ME));
    const cheap = await listings.insert(newListing(OTHER, { price: 20 }));
    const dearer = await listings.insert(newListing(OTHER, { price: 80 }));
    await listings.insert(newListing(OTHER, { price: 150 }));
    await listings.insert(newListing(OTHER, { category: 'electronics' }));
    await listings.insert(newListing(OTHER, { location: north(0.1) }));
    await listings.insert(newListing(OTHER, { status: 'closed' }));
    await listings.insert(newListing(ME));

    const response = await getFeed(`?postId=${mine.id}`);

    expect(response.status).toBe(200);
    const body = response.body as MatchBody;
    expect(body.matches.map((match) => match.post.id)).toEqual([cheap.id, dearer.id]);
    expect(body.matches[0]?.score).toBeGreaterThan(body.matches[1]?.score ?? 1);
    expect(body.matches[0]?.distanceKm).toBe(0);
    expect(body.matches[0]?.travelMinutes).toBeNull();
    expect(body.nextCursor).toBeNull();
    expect(listings.rows).toHaveLength(7);
  });

  // Input: GET ?postId=<my $40 listing>; the store holds a request it meets and a
  //   request whose hard max price is $30
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: { matches: [the request it meets], nextCursor: null }
  test('Seller feed: requests the listing meets', async () => {
    const mine = await listings.insert(newListing(ME, { price: 40 }));
    const fits = await requests.insert(newRequest(OTHER));
    await requests.insert(
      newRequest(OTHER, {
        requestFields: [{ key: 'price', label: 'Max price', kind: 'builtin', type: 'number', value: 30, hard: true }],
      })
    );

    const response = await getFeed(`?postId=${mine.id}`);

    expect(response.status).toBe(200);
    const body = response.body as MatchBody;
    expect(body.matches.map((match) => match.post.id)).toEqual([fits.id]);
    expect(body.nextCursor).toBeNull();
  });

  // Input: GET ?postId=<my request>&limit=2, then the same with cursor=<nextCursor>; the
  //   store holds three matching listings at $10, $20 and $30
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: first page: the $10 and $20 listings and a nextCursor;
  //   second page: the $30 listing and nextCursor null
  test('Pages with limit and cursor', async () => {
    const mine = await requests.insert(newRequest(ME));
    const first = await listings.insert(newListing(OTHER, { price: 10 }));
    const second = await listings.insert(newListing(OTHER, { price: 20 }));
    const third = await listings.insert(newListing(OTHER, { price: 30 }));

    const page1 = await getFeed(`?postId=${mine.id}&limit=2`);

    expect(page1.status).toBe(200);
    const body1 = page1.body as MatchBody;
    expect(body1.matches.map((match) => match.post.id)).toEqual([first.id, second.id]);
    expect(body1.nextCursor).not.toBeNull();

    const page2 = await getFeed(`?postId=${mine.id}&limit=2&cursor=${body1.nextCursor ?? ''}`);

    expect(page2.status).toBe(200);
    const body2 = page2.body as MatchBody;
    expect(body2.matches.map((match) => match.post.id)).toEqual([third.id]);
    expect(body2.nextCursor).toBeNull();
  });

  // Input: GET ?postId=<my request>; no listing meets it
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: { matches: [], nextCursor: null }
  test('No matches', async () => {
    const mine = await requests.insert(newRequest(ME));
    await listings.insert(newListing(OTHER, { price: 500 }));

    const response = await getFeed(`?postId=${mine.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ matches: [], nextCursor: null });
  });

  // Input: GET with no postId, a malformed postId, limit=0, a malformed cursor, or an
  //   unsupported parameter
  // Expected status code: 400
  // Expected behavior: database unchanged
  // Expected output: { error: "Invalid request", details: [a message naming the problem] }
  test.each([
    ['', 'postId must be the id of one of your requests or listings'],
    ['?postId=not-an-id', 'postId must be the id of one of your requests or listings'],
    ['?postId=000000000000000000000001&limit=0', 'limit must be a whole number from 1 to 50'],
    ['?postId=000000000000000000000001&cursor=abc', 'cursor must be the nextCursor from a previous page'],
    ['?postId=000000000000000000000001&maxPrice=50', 'unsupported parameter "maxPrice"'],
  ])('Rejects bad query %p', async (query, detail) => {
    const response = await getFeed(query);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: [detail] });
  });

  // Input: GET ?postId=<an id no post has>
  // Expected status code: 404
  // Expected behavior: database unchanged
  // Expected output: { error: "Not Found" }
  test('Unknown post', async () => {
    const response = await getFeed('?postId=ffffffffffffffffffffffff');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found' });
  });

  // Input: GET ?postId=<another user's request>
  // Expected status code: 403
  // Expected behavior: database unchanged
  // Expected output: { error: "Forbidden" }
  test("Someone else's post", async () => {
    const theirs = await requests.insert(newRequest(OTHER));

    const response = await getFeed(`?postId=${theirs.id}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
  });

  // Input: GET ?postId=<my closed listing>
  // Expected status code: 409
  // Expected behavior: database unchanged
  // Expected output: { error: "Closed posts have no feed" }
  test('Closed post', async () => {
    const closed = await listings.insert(newListing(ME, { status: 'closed' }));

    const response = await getFeed(`?postId=${closed.id}`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Closed posts have no feed' });
  });

  // Input: GET ?postId=<id> without an Authorization header
  // Expected status code: 401
  // Expected behavior: database unchanged
  // Expected output: an error body
  test('No session token', async () => {
    const mine = await requests.insert(newRequest(ME));

    const response = await request(app).get(`/api/feed?postId=${mine.id}`);

    expect(response.status).toBe(401);
  });
});
