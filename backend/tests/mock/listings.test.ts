import request from 'supertest';

import { createApp } from '../../src/app';
import { DuplicateFieldError } from '../../src/models/normalise';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { newListing } from '../helpers/memoryPostCollection';
import { ME, bearer, listingBody } from '../helpers/postFixtures';

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

const SERVER_ERROR = { error: 'Internal Server Error' };
const DOWN = new Error('MongoDB is unreachable');

function create(): request.Test {
  return request(app).post('/api/listings').set('Authorization', bearer(ME)).send(listingBody());
}

// Interface POST /api/listings
describe('Mocked: POST /api/listings', () => {
  // Input: a valid listing
  // Expected status code: 500
  // Expected behavior: the error is logged; nothing is stored
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the listings store rejects the insert with a database error
  test('Database failure', async () => {
    jest.spyOn(store.listings, 'insert').mockRejectedValue(DOWN);

    const response = await create();

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });

  // Input: a valid listing
  // Expected status code: 400
  // Expected behavior: the listing is rejected; nothing is stored
  // Expected output: { error: "Invalid request", details: [...] }
  // Mocked behavior: the listings store rejects the insert with MongoDB's schema-validation error (code 121), and
  //   with a duplicate-field error
  test('Rejected by the database', async () => {
    const insert = jest.spyOn(store.listings, 'insert');
    insert.mockRejectedValueOnce(Object.assign(new Error('Document failed validation'), { code: 121 }));
    insert.mockRejectedValueOnce(new DuplicateFieldError('Duplicate field "colour"'));

    const schema = await create();
    expect(schema.status).toBe(400);
    expect(schema.body).toEqual({
      error: 'Invalid request',
      details: ['a field is outside its allowed values or length'],
    });

    const duplicate = await create();
    expect(duplicate.status).toBe(400);
    expect(duplicate.body).toEqual({ error: 'Invalid request', details: ['Duplicate field "colour"'] });
    expect(store.listings.rows).toHaveLength(0);
  });
});

// Interface GET /api/listings and GET /api/listings/:id
describe('Mocked: GET /api/listings', () => {
  // Input: GET /api/listings, then GET /api/listings/:id
  // Expected status code: 500 both times
  // Expected behavior: the error is logged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the listings store rejects the list query and the lookup with a database error
  test('Database failure', async () => {
    jest.spyOn(store.listings, 'listByOwner').mockRejectedValue(DOWN);
    jest.spyOn(store.listings, 'findById').mockRejectedValue(DOWN);

    const list = await request(app).get('/api/listings').set('Authorization', bearer(ME));
    const one = await request(app).get('/api/listings/ffffffffffffffffffffffff').set('Authorization', bearer(ME));

    expect([list.status, one.status]).toEqual([500, 500]);
    expect(list.body).toEqual(SERVER_ERROR);
  });
});

// Interface PATCH /api/listings/:id
describe('Mocked: PATCH /api/listings/:id', () => {
  // Input: PATCH { status: "closed" } on the caller's listing
  // Expected status code: 500
  // Expected behavior: the error is logged; the stored listing stays open
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the listings store rejects the replace with a database error
  test('Database failure', async () => {
    const stored = await store.listings.insert(newListing(ME));
    jest.spyOn(store.listings, 'replace').mockRejectedValue(DOWN);

    const response = await request(app)
      .patch(`/api/listings/${stored.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'closed' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
    expect(store.listings.rows[0]?.status).toBe('open');
  });
});

// Interface DELETE /api/listings/:id
describe('Mocked: DELETE /api/listings/:id', () => {
  // Input: DELETE of the caller's own listing
  // Expected status code: 500
  // Expected behavior: the error is logged; the listing is not removed
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the listings store rejects the removal with a database error
  test('Database failure', async () => {
    const stored = await store.listings.insert(newListing(ME));
    jest.spyOn(store.listings, 'remove').mockRejectedValue(DOWN);

    const response = await request(app).delete(`/api/listings/${stored.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(store.listings.rows).toHaveLength(1);
  });
});
