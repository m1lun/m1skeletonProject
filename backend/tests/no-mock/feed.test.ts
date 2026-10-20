import request from 'supertest';

import { createApp } from '../../src/app';
import type { Listing } from '../../src/models/listing';
import type { BuyerRequest } from '../../src/models/request';
import { newListing } from '../helpers/memoryPostCollection';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { bearer, ME, newRequest, OTHER } from '../helpers/postFixtures';

const SELLER = OTHER;
const BUYER = OTHER;

interface FeedBody {
  listings: Listing[];
  nextCursor: string | null;
}

interface RequestFeedBody {
  requests: BuyerRequest[];
  nextCursor: string | null;
}

let store: MemoryStore;
let listings: MemoryStore['listings'];
let requests: MemoryStore['requests'];
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  listings = store.listings;
  requests = store.requests;
  app = createApp({ sessions: store.sessions, store });
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

  // Input: GET ?category=%20Furniture%20; the store holds a furniture listing and a
  //   bikes listing from another user
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: { listings: [the furniture listing], nextCursor: null }
  test('Filters by category, ignoring case and spacing', async () => {
    const desk = await listings.insert(newListing(SELLER, { category: 'furniture' }));
    await listings.insert(newListing(SELLER, { category: 'bikes' }));

    const response = await request(app)
      .get('/api/feed/listings?category=%20Furniture%20')
      .set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    const body = response.body as FeedBody;
    expect(body.listings.map((listing) => listing.id)).toEqual([desk.id]);
    expect(body.nextCursor).toBeNull();
  });

  // Input: GET ?minPrice=20&maxPrice=50; the store holds listings priced 10, 20, 50 and 60
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: { listings: [the listings priced 50 and 20, newest first], nextCursor: null }
  test('Filters by price range, inclusive', async () => {
    await listings.insert(newListing(SELLER, { price: 10 }));
    const twenty = await listings.insert(newListing(SELLER, { price: 20 }));
    const fifty = await listings.insert(newListing(SELLER, { price: 50 }));
    await listings.insert(newListing(SELLER, { price: 60 }));

    const response = await request(app)
      .get('/api/feed/listings?minPrice=20&maxPrice=50')
      .set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    const body = response.body as FeedBody;
    expect(body.listings.map((listing) => listing.id)).toEqual([fifty.id, twenty.id]);
  });

  // Input: GET ?lat=49.26&lng=-123.25&radiusKm=5 (UBC); the store holds a listing at UBC
  //   and one downtown, about 9 km away
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: { listings: [the UBC listing], nextCursor: null }
  test('Filters by distance', async () => {
    const nearby = await listings.insert(newListing(SELLER, { location: { type: 'Point', coordinates: [-123.25, 49.26] } }));
    await listings.insert(newListing(SELLER, { location: { type: 'Point', coordinates: [-123.12, 49.28] } }));

    const response = await request(app)
      .get('/api/feed/listings?lat=49.26&lng=-123.25&radiusKm=5')
      .set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    const body = response.body as FeedBody;
    expect(body.listings.map((listing) => listing.id)).toEqual([nearby.id]);
  });

  // Input: GET ?category=furniture&maxPrice=30&limit=1, then the same with
  //   before=<nextCursor>; the store holds two cheap desks, an expensive desk and a cheap bike
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: first page: the newer cheap desk and a nextCursor;
  //   second page: the older cheap desk and nextCursor null
  test('Pages through filtered results', async () => {
    const olderDesk = await listings.insert(newListing(SELLER, { category: 'furniture', price: 25 }));
    const newerDesk = await listings.insert(newListing(SELLER, { category: 'furniture', price: 30 }));
    await listings.insert(newListing(SELLER, { category: 'furniture', price: 90 }));
    await listings.insert(newListing(SELLER, { category: 'bikes', price: 20 }));
    const filters = 'category=furniture&maxPrice=30&limit=1';

    const page1 = await request(app).get(`/api/feed/listings?${filters}`).set('Authorization', bearer(ME));

    expect(page1.status).toBe(200);
    const body1 = page1.body as FeedBody;
    expect(body1.listings.map((listing) => listing.id)).toEqual([newerDesk.id]);
    expect(body1.nextCursor).toBe(newerDesk.id);

    const page2 = await request(app)
      .get(`/api/feed/listings?${filters}&before=${newerDesk.id}`)
      .set('Authorization', bearer(ME));

    expect(page2.status).toBe(200);
    const body2 = page2.body as FeedBody;
    expect(body2.listings.map((listing) => listing.id)).toEqual([olderDesk.id]);
    expect(body2.nextCursor).toBeNull();
  });

  // Input: GET ?category=%20%20 (blank)
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: ["category must not be empty"] }
  test('Blank category', async () => {
    const response = await request(app).get('/api/feed/listings?category=%20%20').set('Authorization', bearer(ME));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['category must not be empty'] });
  });

  // Input: GET ?minPrice=abc&maxPrice=-1
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: [one message for each price] }
  test('Invalid prices', async () => {
    const response = await request(app)
      .get('/api/feed/listings?minPrice=abc&maxPrice=-1')
      .set('Authorization', bearer(ME));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid request',
      details: ['minPrice must be a number from 0 up', 'maxPrice must be a number from 0 up'],
    });
  });

  // Input: GET ?minPrice=50&maxPrice=20
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: ["minPrice must not be more than maxPrice"] }
  test('Minimum price above maximum', async () => {
    const response = await request(app)
      .get('/api/feed/listings?minPrice=50&maxPrice=20')
      .set('Authorization', bearer(ME));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['minPrice must not be more than maxPrice'] });
  });

  // Input: GET ?lat=49.26&lng=-123.25 (no radiusKm)
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: ["lat, lng and radiusKm must be sent together"] }
  test('Incomplete distance filter', async () => {
    const response = await request(app)
      .get('/api/feed/listings?lat=49.26&lng=-123.25')
      .set('Authorization', bearer(ME));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid request',
      details: ['lat, lng and radiusKm must be sent together'],
    });
  });

  // Input: GET ?lat=91&lng=-181&radiusKm=101
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: [one message for each out-of-range value] }
  test('Distance filter out of range', async () => {
    const response = await request(app)
      .get('/api/feed/listings?lat=91&lng=-181&radiusKm=101')
      .set('Authorization', bearer(ME));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid request',
      details: [
        'lat must be a number from -90 to 90',
        'lng must be a number from -180 to 180',
        'radiusKm must be a number from 0 to 100',
      ],
    });
  });

  // Input: GET ?maxprice=30 (misspelt maxPrice)
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: ['unsupported parameter "maxprice"'] }
  test('Unsupported parameter', async () => {
    const response = await request(app).get('/api/feed/listings?maxprice=30').set('Authorization', bearer(ME));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['unsupported parameter "maxprice"'] });
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

function withBudget(budget: number): Partial<BuyerRequest> {
  return {
    requestFields: [{ key: 'price', label: 'Max price', kind: 'builtin', type: 'number', value: budget, hard: true }],
  };
}

// Interface GET /api/feed/requests
describe('Unmocked: GET /api/feed/requests', () => {
  // Input: GET with a session token; the store holds two open requests from another
  //   user, one of the caller's own requests and a closed request
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: { requests: [the two open requests from the other user, newest first], nextCursor: null }
  test('Lists open requests from other users, newest first', async () => {
    const older = await requests.insert(newRequest(BUYER));
    const newer = await requests.insert(newRequest(BUYER));
    await requests.insert(newRequest(ME));
    await requests.insert(newRequest(BUYER, { status: 'closed' }));

    const response = await request(app).get('/api/feed/requests').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    const body = response.body as RequestFeedBody;
    expect(body.requests.map((post) => post.id)).toEqual([newer.id, older.id]);
    expect(body.nextCursor).toBeNull();
  });

  // Input: GET ?minPrice=60&maxPrice=150; the store holds requests with budgets of 50,
  //   100 and 200, and one with no budget
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: { requests: [the request with a budget of 100], nextCursor: null }
  test('Filters by budget, leaving out requests without one', async () => {
    await requests.insert(newRequest(BUYER, withBudget(50)));
    const hundred = await requests.insert(newRequest(BUYER, withBudget(100)));
    await requests.insert(newRequest(BUYER, withBudget(200)));
    await requests.insert(newRequest(BUYER, { requestFields: [] }));

    const response = await request(app)
      .get('/api/feed/requests?minPrice=60&maxPrice=150')
      .set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    const body = response.body as RequestFeedBody;
    expect(body.requests.map((post) => post.id)).toEqual([hundred.id]);
  });

  // Input: GET ?category=furniture&lat=49.26&lng=-123.25&radiusKm=5; the store holds a
  //   furniture request at UBC, a furniture request downtown and a bikes request at UBC
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: { requests: [the furniture request at UBC], nextCursor: null }
  test('Filters by category and distance', async () => {
    const nearby = await requests.insert(newRequest(BUYER, { category: 'furniture' }));
    await requests.insert(
      newRequest(BUYER, { category: 'furniture', location: { type: 'Point', coordinates: [-123.12, 49.28] } })
    );
    await requests.insert(newRequest(BUYER, { category: 'bikes' }));

    const response = await request(app)
      .get('/api/feed/requests?category=furniture&lat=49.26&lng=-123.25&radiusKm=5')
      .set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    const body = response.body as RequestFeedBody;
    expect(body.requests.map((post) => post.id)).toEqual([nearby.id]);
  });

  // Input: GET ?minPrice=abc
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: ["minPrice must be a number from 0 up"] }
  test('Invalid filter', async () => {
    const response = await request(app).get('/api/feed/requests?minPrice=abc').set('Authorization', bearer(ME));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['minPrice must be a number from 0 up'] });
  });

  // Input: GET with no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected before reaching the feed
  // Expected output: error message naming the missing header
  test('Not signed in', async () => {
    const response = await request(app).get('/api/feed/requests');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing Authorization: Bearer <session token> header' });
  });
});
