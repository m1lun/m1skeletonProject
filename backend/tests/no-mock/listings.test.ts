import request from 'supertest';

import { createApp } from '../../src/app';
import type { Listing } from '../../src/models/listing';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { newListing } from '../helpers/memoryPostCollection';
import { ME, OTHER, PHOTO_ID, bearer, listingBody, type ErrorBody } from '../helpers/postFixtures';

// Each test starts from an empty store and the store is thrown away afterwards.
let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

function create(body: unknown, userId = ME): request.Test {
  return request(app).post('/api/listings').set('Authorization', bearer(userId)).send(body as object);
}

// Interface POST /api/listings
describe('Unmocked: POST /api/listings', () => {
  // Input: a valid listing (category, price, condition, description, address, location, one
  //   photo id, brand and dimensions fields)
  // Expected status code: 201
  // Expected behavior: the listing is stored as open and owned by the caller
  // Expected output: the stored listing, with an id, ownerId, status "open", and each built-in
  //   field given its label and type
  test('Valid listing', async () => {
    const response = await create(listingBody());

    expect(response.status).toBe(201);
    const listing = response.body as Listing;
    expect(listing).toMatchObject({
      ownerId: ME,
      category: 'Furniture',
      price: 40,
      condition: 'good',
      status: 'open',
      photoIds: [PHOTO_ID],
      location: { type: 'Point', coordinates: [-123.25, 49.26] },
    });
    expect(listing.listingFields.map((field) => [field.key, field.label, field.type])).toEqual([
      ['brand', 'Brand', 'text'],
      ['dimensions', 'Size', 'dimensions'],
    ]);
    expect(store.listings.rows).toHaveLength(1);
    expect(store.listings.rows[0]?.id).toBe(listing.id);
  });

  // Input: a valid listing with only the required fields (no description, no fields)
  // Expected status code: 201
  // Expected behavior: the listing is stored with an empty description and no fields
  // Expected output: the stored listing
  test('Only required fields', async () => {
    const response = await create(listingBody({ description: undefined, listingFields: [] }));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ description: '', listingFields: [] });
  });

  // Input: a valid listing with a brand, and a custom text field "Frame size" = "Large"
  // Expected status code: 201
  // Expected behavior: the category, the brand value and the custom value are saved as options,
  //   and the custom field is saved for the caller so it can be reused
  // Expected output: the stored listing
  test('Remembers new values for next time', async () => {
    const fields = [
      { kind: 'builtin', key: 'brand', value: 'IKEA' },
      { kind: 'custom', label: 'Frame size', type: 'text', value: 'Large' },
    ];

    const response = await create(listingBody({ category: 'Bikes', listingFields: fields }));

    expect(response.status).toBe(201);
    expect(store.options.rows.map((option) => [option.field, option.key])).toEqual(
      expect.arrayContaining([
        ['category', 'bikes'],
        ['brand', 'ikea'],
        ['frame size', 'large'],
      ]),
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

  // Input: an Authorization header with a token that was not issued by this server
  // Expected status code: 401
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid or expired session token" }
  test('Invalid session token', async () => {
    const response = await request(app)
      .post('/api/listings')
      .set('Authorization', 'Bearer not-a-real-token')
      .send(listingBody());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired session token' });
    expect(store.listings.rows).toHaveLength(0);
  });

  // Input: a listing that breaks one rule; each case below names the rule
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: [the message for that rule] }
  test.each([
    ['category is missing', { category: undefined }, 'category is required'],
    ['category is blank', { category: '   ' }, 'category is required'],
    ['address is missing', { address: undefined }, 'address is required'],
    ['description is not a string', { description: 5 }, 'description must be a string'],
    ['price is negative', { price: -1 }, 'price must be a number of at least 0'],
    ['price is not a number', { price: 'cheap' }, 'price must be a number of at least 0'],
    ['price is missing', { price: undefined }, 'price must be a number of at least 0'],
    [
      'condition is unknown',
      { condition: 'broken' },
      'condition must be one of: new, like new, good, fair, poor',
    ],
    ['location is missing', { location: undefined }, 'location must be { longitude, latitude }'],
    ['longitude is out of range', { location: { longitude: 200, latitude: 10 } }, 'location is out of range'],
    ['latitude is out of range', { location: { longitude: 10, latitude: 95 } }, 'location is out of range'],
    ['there are no photos', { photoIds: [] }, 'at least 1 photo is required'],
    [
      'a photo id is malformed',
      { photoIds: ['not-an-id'] },
      'photoIds must be an array of ids returned by POST /api/photos',
    ],
    [
      'there are more than 10 photos',
      { photoIds: Array.from({ length: 11 }, () => PHOTO_ID) },
      'at most 10 photos are allowed',
    ],
    ['the fields are not an array', { listingFields: 'brand' }, 'listingFields must be an array'],
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

  // Input: a listing with several mistakes at once (no category, negative price, no photos)
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: [every message, so the user can fix them together] }
  test('Reports every problem at once', async () => {
    const response = await create(listingBody({ category: undefined, price: -1, photoIds: [] }));

    expect(response.status).toBe(400);
    const body = response.body as ErrorBody;
    expect(body.details).toEqual([
      'category is required',
      'at least 1 photo is required',
      'price must be a number of at least 0',
    ]);
  });

  // Input: a body that is a JSON array instead of an object
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: ["request body must be a JSON object"] }
  test('Body that is a JSON array', async () => {
    const response = await request(app)
      .post('/api/listings')
      .set('Authorization', bearer(ME))
      .send([] as unknown as object);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['request body must be a JSON object'] });
  });

  // Input: a body that is not valid JSON
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Malformed request body" }
  test('Malformed JSON', async () => {
    const response = await request(app)
      .post('/api/listings')
      .set('Authorization', bearer(ME))
      .set('Content-Type', 'application/json')
      .send('{"category": ');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Malformed request body' });
    expect(store.listings.rows).toHaveLength(0);
  });
});

// Interface GET /api/listings and GET /api/listings/:id
describe('Unmocked: GET /api/listings', () => {
  // Input: GET with a session token; the store holds two of the caller's listings and one from another user
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: only the caller's two listings, newest first
  test('Lists only the caller’s own listings', async () => {
    const older = await store.listings.insert(newListing(ME, { description: 'Older' }));
    const newer = await store.listings.insert(newListing(ME, { description: 'Newer' }));
    await store.listings.insert(newListing(OTHER));

    const response = await request(app).get('/api/listings').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect((response.body as Listing[]).map((listing) => listing.id)).toEqual([newer.id, older.id]);
  });

  // Input: GET with a session token; the caller has no listings
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: []
  test('No listings', async () => {
    const response = await request(app).get('/api/listings').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  // Input: GET without a session token
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing Authorization: Bearer <session token> header" }
  test('Missing session token', async () => {
    const response = await request(app).get('/api/listings');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing Authorization: Bearer <session token> header' });
  });
});

describe('Unmocked: GET /api/listings/:id', () => {
  // Input: GET of the caller's own listing
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: the listing
  test('Own listing', async () => {
    const listing = await store.listings.insert(newListing(ME));

    const response = await request(app).get(`/api/listings/${listing.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect((response.body as Listing).id).toBe(listing.id);
  });

  // Input: GET of an id that does not exist
  // Expected status code: 404
  // Expected behavior: database unchanged
  // Expected output: { error: "Not Found" }
  test('Unknown id', async () => {
    const response = await request(app).get('/api/listings/ffffffffffffffffffffffff').set('Authorization', bearer(ME));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found' });
  });

  // Input: GET of a listing owned by another user
  // Expected status code: 403
  // Expected behavior: database unchanged; the listing is not revealed
  // Expected output: { error: "Forbidden" }
  test('Another user’s listing', async () => {
    const listing = await store.listings.insert(newListing(OTHER));

    const response = await request(app).get(`/api/listings/${listing.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
  });
});

// Interface PATCH /api/listings/:id
describe('Unmocked: PATCH /api/listings/:id', () => {
  // Input: PATCH { price: 55, description: "Now with a chair" } on the caller's listing
  // Expected status code: 200
  // Expected behavior: the listing is updated in the database; fields that were not sent keep their values
  // Expected output: the updated listing
  test('Edit fields', async () => {
    const listing = await store.listings.insert(newListing(ME, { category: 'furniture', condition: 'good' }));

    const response = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set('Authorization', bearer(ME))
      .send({ price: 55, description: 'Now with a chair' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: listing.id, price: 55, description: 'Now with a chair', condition: 'good' });
    expect(store.listings.rows[0]).toMatchObject({ price: 55, description: 'Now with a chair', condition: 'good' });
  });

  // Input: PATCH { status: "closed" }, then PATCH { status: "open" }
  // Expected status code: 200 each time
  // Expected behavior: the listing is closed and then reopened, and nothing else changes
  // Expected output: the listing with the new status
  test('Close and reopen', async () => {
    const listing = await store.listings.insert(newListing(ME, { price: 40 }));

    const closed = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'closed' });
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({ status: 'closed', price: 40 });

    const reopened = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'open' });
    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({ status: 'open', price: 40 });
  });

  // Input: PATCH that tries to change the owner, the id and the status through other fields
  //   ({ ownerId: "user-other", id: "x" })
  // Expected status code: 200
  // Expected behavior: the server-owned fields are ignored; the listing still belongs to the caller
  // Expected output: the listing, unchanged
  test('Ignores server-owned fields', async () => {
    const listing = await store.listings.insert(newListing(ME));

    const response = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set('Authorization', bearer(ME))
      .send({ ownerId: OTHER, id: 'x' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: listing.id, ownerId: ME });
    expect(store.listings.rows[0]?.ownerId).toBe(ME);
  });

  // Input: PATCH { status: "sold" }
  // Expected status code: 400
  // Expected behavior: request is rejected; the listing is unchanged
  // Expected output: { error: "Invalid request", details: ['status must be "open" or "closed"'] }
  test('Invalid status', async () => {
    const listing = await store.listings.insert(newListing(ME));

    const response = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'sold' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['status must be "open" or "closed"'] });
    expect(store.listings.rows[0]?.status).toBe('open');
  });

  // Input: PATCH { price: -5 }
  // Expected status code: 400
  // Expected behavior: request is rejected; the listing is unchanged
  // Expected output: { error: "Invalid request", details: ["price must be a number of at least 0"] }
  test('Invalid change', async () => {
    const listing = await store.listings.insert(newListing(ME, { price: 40 }));

    const response = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set('Authorization', bearer(ME))
      .send({ price: -5 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['price must be a number of at least 0'] });
    expect(store.listings.rows[0]?.price).toBe(40);
  });

  // Input: PATCH whose body is a JSON array
  // Expected status code: 400
  // Expected behavior: request is rejected; the listing is unchanged
  // Expected output: { error: "Invalid request", details: ["request body must be a JSON object"] }
  test('Body that is a JSON array', async () => {
    const listing = await store.listings.insert(newListing(ME));

    const response = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set('Authorization', bearer(ME))
      .send([] as unknown as object);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['request body must be a JSON object'] });
  });

  // Input: PATCH of a listing owned by another user
  // Expected status code: 403
  // Expected behavior: the listing is unchanged
  // Expected output: { error: "Forbidden" }
  test('Another user’s listing', async () => {
    const listing = await store.listings.insert(newListing(OTHER, { price: 40 }));

    const response = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set('Authorization', bearer(ME))
      .send({ price: 1 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    expect(store.listings.rows[0]?.price).toBe(40);
  });

  // Input: PATCH of an id that does not exist
  // Expected status code: 404
  // Expected behavior: database unchanged
  // Expected output: { error: "Not Found" }
  test('Unknown id', async () => {
    const response = await request(app)
      .patch('/api/listings/ffffffffffffffffffffffff')
      .set('Authorization', bearer(ME))
      .send({ price: 1 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found' });
  });
});

// Interface DELETE /api/listings/:id
describe('Unmocked: DELETE /api/listings/:id', () => {
  // Input: DELETE of the caller's own listing
  // Expected status code: 204
  // Expected behavior: the listing is removed from the database; the caller's other listing remains
  // Expected output: empty body
  test('Own listing', async () => {
    const doomed = await store.listings.insert(newListing(ME));
    const kept = await store.listings.insert(newListing(ME));

    const response = await request(app).delete(`/api/listings/${doomed.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(store.listings.rows.map((row) => row.id)).toEqual([kept.id]);
  });

  // Input: DELETE of a listing owned by another user
  // Expected status code: 403
  // Expected behavior: the listing is not removed
  // Expected output: { error: "Forbidden" }
  test('Another user’s listing', async () => {
    const listing = await store.listings.insert(newListing(OTHER));

    const response = await request(app).delete(`/api/listings/${listing.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    expect(store.listings.rows).toHaveLength(1);
  });

  // Input: DELETE of an id that does not exist
  // Expected status code: 404
  // Expected behavior: database unchanged
  // Expected output: { error: "Not Found" }
  test('Unknown id', async () => {
    const response = await request(app)
      .delete('/api/listings/ffffffffffffffffffffffff')
      .set('Authorization', bearer(ME));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found' });
  });
});
