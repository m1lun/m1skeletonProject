import request from 'supertest';

import { createApp } from '../../src/app';
import type { Listing } from '../../src/models/listing';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { ME, PHOTO_ID, bearer, listingBody } from '../helpers/postFixtures';

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

function create(body: unknown): request.Test {
  return request(app).post('/api/listings').set('Authorization', bearer(ME)).send(body as object);
}

describe('Unmocked: POST /api/listings', () => {
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

  test('Missing session token', async () => {
    const response = await request(app).post('/api/listings').send(listingBody());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing Authorization: Bearer <session token> header' });
    expect(store.listings.rows).toHaveLength(0);
  });

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
