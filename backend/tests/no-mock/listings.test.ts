import request from 'supertest';

import { createApp } from '../../src/app';
import type { Listing } from '../../src/models/listing';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { newListing } from '../helpers/memoryPostCollection';
import { ME, OTHER, PHOTO_ID, bearer, listingBody } from '../helpers/postFixtures';

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

function create(body: unknown): request.Test {
  return request(app).post('/api/listings').set('Authorization', bearer(ME)).send(body as object);
}

function patch(id: string, body: unknown, userId = ME): request.Test {
  return request(app).patch(`/api/listings/${id}`).set('Authorization', bearer(userId)).send(body as object);
}

// Interface POST /api/listings
describe('Unmocked: POST /api/listings', () => {
  // Input: a valid listing with a brand and a custom field "Frame size"
  // Expected status code: 201
  // Expected behavior: stored as open and owned by the caller; the category, brand and custom field are
  //   remembered as options for next time
  // Expected output: the stored listing, with each built-in field given its label and type
  test('Valid listing', async () => {
    const fields = [
      { kind: 'builtin', key: 'brand', value: 'IKEA' },
      { kind: 'custom', label: 'Frame size', type: 'text', value: 'Large' },
    ];

    const response = await create(listingBody({ listingFields: fields }));

    expect(response.status).toBe(201);
    const listing = response.body as Listing;
    expect(listing).toMatchObject({ ownerId: ME, price: 40, condition: 'good', status: 'open', photoIds: [PHOTO_ID] });
    expect(listing.listingFields[0]).toMatchObject({ key: 'brand', label: 'Brand', type: 'text' });
    expect(store.listings.rows).toHaveLength(1);
    expect(store.options.rows.map((option) => option.field)).toEqual(
      expect.arrayContaining(['category', 'brand', 'frame size']),
    );
    expect(store.customFields.rows).toEqual([{ ownerId: ME, key: 'frame size', label: 'Frame size', type: 'text' }]);
  });

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Missing Authorization: Bearer <session token> header" }
  test('Missing session token', async () => {
    const response = await request(app).post('/api/listings').send(listingBody());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing Authorization: Bearer <session token> header' });
    expect(store.listings.rows).toHaveLength(0);
  });

  // Input: a listing that breaks one rule; each case names the rule
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: [the message for that rule] }
  test.each([
    ['category is missing', { category: undefined }, 'category is required'],
    ['address is missing', { address: undefined }, 'address is required'],
    ['description is not a string', { description: 5 }, 'description must be a string'],
    ['price is negative', { price: -1 }, 'price must be a number of at least 0'],
    ['condition is unknown', { condition: 'broken' }, 'condition must be one of: new, like new, good, fair, poor'],
    ['location is missing', { location: undefined }, 'location must be { longitude, latitude }'],
    ['location is out of range', { location: { longitude: 200, latitude: 10 } }, 'location is out of range'],
    ['there are no photos', { photoIds: [] }, 'at least 1 photo is required'],
    ['a photo id is malformed', { photoIds: ['x'] }, 'photoIds must be an array of ids returned by POST /api/photos'],
    [
      'there are more than 10 photos',
      { photoIds: Array.from({ length: 11 }, () => PHOTO_ID) },
      'at most 10 photos are allowed',
    ],
    ['the fields are not an array', { listingFields: 'x' }, 'listingFields must be an array'],
    [
      'a built-in field is unknown',
      { listingFields: [{ kind: 'builtin', key: 'weight', value: 3 }] },
      'listingFields[0] has an unknown field "weight"',
    ],
    [
      'a custom field has no label',
      { listingFields: [{ kind: 'custom', type: 'text', value: 'x' }] },
      'listingFields[0] needs a label',
    ],
    [
      'a custom field reuses a built-in name',
      { listingFields: [{ kind: 'custom', label: 'Brand', type: 'text', value: 'x' }] },
      '"Brand" is already a built-in field, so there is no need to add it as a custom field',
    ],
  ])('Invalid listing: %s', async (_name, overrides, message) => {
    const response = await create(listingBody(overrides));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: [message] });
    expect(store.listings.rows).toHaveLength(0);
  });

  // Input: a body that is a JSON array, and a body that is not valid JSON
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", ... } for the array, { error: "Malformed request body" } for bad JSON
  test('Body is not a JSON object', async () => {
    const array = await create([]);
    expect(array.status).toBe(400);
    expect(array.body).toEqual({ error: 'Invalid request', details: ['request body must be a JSON object'] });

    const broken = await request(app)
      .post('/api/listings')
      .set('Authorization', bearer(ME))
      .set('Content-Type', 'application/json')
      .send('{"category": ');
    expect(broken.status).toBe(400);
    expect(broken.body).toEqual({ error: 'Malformed request body' });
  });
});

// Interface GET /api/listings and GET /api/listings/:id
describe('Unmocked: GET /api/listings', () => {
  // Input: GET with a session token; the store holds two of the caller's listings and one from another user
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: only the caller's two listings, newest first
  test('Lists only the caller’s own listings', async () => {
    const older = await store.listings.insert(newListing(ME));
    const newer = await store.listings.insert(newListing(ME));
    await store.listings.insert(newListing(OTHER));

    const response = await request(app).get('/api/listings').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect((response.body as Listing[]).map((listing) => listing.id)).toEqual([newer.id, older.id]);
  });

  // Input: GET /api/listings/:id for the caller's listing, one from another user, and an unknown id
  // Expected status code: 200, 403, 404
  // Expected behavior: database unchanged; another user's listing is not revealed
  // Expected output: the listing, { error: "Forbidden" }, { error: "Not Found" }
  test('Get by id', async () => {
    const own = await store.listings.insert(newListing(ME));
    const theirs = await store.listings.insert(newListing(OTHER));
    const get = (id: string): request.Test => request(app).get(`/api/listings/${id}`).set('Authorization', bearer(ME));

    const ownResponse = await get(own.id);
    expect(ownResponse.status).toBe(200);
    expect((ownResponse.body as Listing).id).toBe(own.id);

    const forbidden = await get(theirs.id);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: 'Forbidden' });

    const missing = await get('ffffffffffffffffffffffff');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Not Found' });
  });
});

// Interface PATCH /api/listings/:id
describe('Unmocked: PATCH /api/listings/:id', () => {
  // Input: PATCH { price: 55 } on the caller's listing
  // Expected status code: 200
  // Expected behavior: the listing is updated; fields that were not sent keep their values
  // Expected output: the updated listing
  test('Edit fields', async () => {
    const listing = await store.listings.insert(newListing(ME, { condition: 'good' }));

    const response = await patch(listing.id, { price: 55 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: listing.id, price: 55, condition: 'good' });
    expect(store.listings.rows[0]?.price).toBe(55);
  });

  // Input: PATCH { status: "closed" }, then { status: "open" }
  // Expected status code: 200 each time
  // Expected behavior: the listing is closed and then reopened
  // Expected output: the listing with the new status
  test('Close and reopen', async () => {
    const listing = await store.listings.insert(newListing(ME));

    expect((await patch(listing.id, { status: 'closed' })).body).toMatchObject({ status: 'closed' });
    expect((await patch(listing.id, { status: 'open' })).body).toMatchObject({ status: 'open' });
  });

  // Input: PATCH { status: "sold" }, and PATCH { price: -5 }
  // Expected status code: 400
  // Expected behavior: request is rejected; the listing is unchanged
  // Expected output: { error: "Invalid request", details: [the message for that rule] }
  test('Invalid change', async () => {
    const listing = await store.listings.insert(newListing(ME, { price: 40 }));

    const status = await patch(listing.id, { status: 'sold' });
    expect(status.status).toBe(400);
    expect(status.body).toEqual({ error: 'Invalid request', details: ['status must be "open" or "closed"'] });

    const price = await patch(listing.id, { price: -5 });
    expect(price.status).toBe(400);
    expect(price.body).toEqual({ error: 'Invalid request', details: ['price must be a number of at least 0'] });
    expect(store.listings.rows[0]).toMatchObject({ status: 'open', price: 40 });
  });

  // Input: PATCH of a listing owned by another user
  // Expected status code: 403
  // Expected behavior: the listing is unchanged
  // Expected output: { error: "Forbidden" }
  test('Another user’s listing', async () => {
    const listing = await store.listings.insert(newListing(OTHER, { price: 40 }));

    const response = await patch(listing.id, { price: 1 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    expect(store.listings.rows[0]?.price).toBe(40);
  });
});

// Interface DELETE /api/listings/:id
describe('Unmocked: DELETE /api/listings/:id', () => {
  // Input: DELETE of the caller's listing, then of a listing owned by another user
  // Expected status code: 204, then 403
  // Expected behavior: the caller's listing is removed; the other user's listing is not
  // Expected output: empty body, then { error: "Forbidden" }
  test('Own and another user’s listing', async () => {
    const own = await store.listings.insert(newListing(ME));
    const theirs = await store.listings.insert(newListing(OTHER));
    const remove = (id: string): request.Test =>
      request(app).delete(`/api/listings/${id}`).set('Authorization', bearer(ME));

    expect((await remove(own.id)).status).toBe(204);
    const forbidden = await remove(theirs.id);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: 'Forbidden' });
    expect(store.listings.rows.map((row) => row.id)).toEqual([theirs.id]);
  });
});
