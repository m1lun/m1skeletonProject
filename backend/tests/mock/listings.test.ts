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
// MongoDB's code for a document that fails the collection's $jsonSchema.
const DOCUMENT_VALIDATION_FAILED = 121;
const MISSING_ID = 'ffffffffffffffffffffffff';

// Interface POST /api/listings
describe('Mocked: POST /api/listings', () => {
  // Input: a valid listing
  // Expected status code: 500
  // Expected behavior: the error is logged; the client gets no details
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the listings store rejects the insert with a database error
  test('Database failure on insert', async () => {
    jest.spyOn(store.listings, 'insert').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).post('/api/listings').set('Authorization', bearer(ME)).send(listingBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });

  // Input: a valid listing
  // Expected status code: 500
  // Expected behavior: the error is logged; the client gets no details
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the options store rejects when the new category is remembered
  test('Database failure while remembering options', async () => {
    jest.spyOn(store.options, 'ensure').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).post('/api/listings').set('Authorization', bearer(ME)).send(listingBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });

  // Input: a valid listing
  // Expected status code: 400
  // Expected behavior: the listing is rejected; nothing is stored
  // Expected output: { error: "Invalid request", details: ["a field is outside its allowed values or length"] }
  // Mocked behavior: the listings store rejects the insert with MongoDB's document-validation error (code 121)
  test('Document fails the database schema', async () => {
    jest.spyOn(store.listings, 'insert').mockRejectedValue(
      Object.assign(new Error('Document failed validation'), { code: DOCUMENT_VALIDATION_FAILED }),
    );

    const response = await request(app).post('/api/listings').set('Authorization', bearer(ME)).send(listingBody());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid request',
      details: ['a field is outside its allowed values or length'],
    });
    expect(store.listings.rows).toHaveLength(0);
  });

  // Input: a valid listing
  // Expected status code: 400
  // Expected behavior: the listing is rejected; nothing is stored
  // Expected output: { error: "Invalid request", details: ['Duplicate field "colour"'] }
  // Mocked behavior: the listings store rejects the insert because two fields normalise to the same key
  test('Duplicate field', async () => {
    jest.spyOn(store.listings, 'insert').mockRejectedValue(new DuplicateFieldError('Duplicate field "colour"'));

    const response = await request(app).post('/api/listings').set('Authorization', bearer(ME)).send(listingBody());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['Duplicate field "colour"'] });
  });
});

// Interface GET /api/listings and GET /api/listings/:id
describe('Mocked: GET /api/listings', () => {
  // Input: GET with a session token
  // Expected status code: 500
  // Expected behavior: the error is logged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the listings store rejects the listing query with a database error
  test('Database failure', async () => {
    jest.spyOn(store.listings, 'listByOwner').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).get('/api/listings').set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });
});

describe('Mocked: GET /api/listings/:id', () => {
  // Input: GET of an id
  // Expected status code: 500
  // Expected behavior: the error is logged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the listings store rejects the lookup with a database error
  test('Database failure', async () => {
    jest.spyOn(store.listings, 'findById').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).get(`/api/listings/${MISSING_ID}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });
});

// Interface PATCH /api/listings/:id
describe('Mocked: PATCH /api/listings/:id', () => {
  // Input: PATCH { status: "closed" } on the caller's listing
  // Expected status code: 500
  // Expected behavior: the error is logged; the stored listing is unchanged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the listings store rejects the lookup with a database error
  test('Database failure on lookup', async () => {
    jest.spyOn(store.listings, 'findById').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app)
      .patch(`/api/listings/${MISSING_ID}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'closed' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });

  // Input: PATCH { status: "closed" } on the caller's listing
  // Expected status code: 500
  // Expected behavior: the error is logged; the stored listing stays open
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the listings store rejects the replace with a database error
  test('Database failure on replace', async () => {
    const stored = await store.listings.insert(newListing(ME));
    jest.spyOn(store.listings, 'replace').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app)
      .patch(`/api/listings/${stored.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'closed' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
    expect(store.listings.rows[0]?.status).toBe('open');
  });

  // Input: PATCH { status: "closed" } on the caller's listing
  // Expected status code: 400
  // Expected behavior: the edit is rejected; the stored listing stays open
  // Expected output: { error: "Invalid request", details: ['Duplicate field "colour"'] }
  // Mocked behavior: the listings store rejects the replace because two fields normalise to the same key
  test('Duplicate field on replace', async () => {
    const stored = await store.listings.insert(newListing(ME));
    jest.spyOn(store.listings, 'replace').mockRejectedValue(new DuplicateFieldError('Duplicate field "colour"'));

    const response = await request(app)
      .patch(`/api/listings/${stored.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'closed' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['Duplicate field "colour"'] });
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
    jest.spyOn(store.listings, 'remove').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).delete(`/api/listings/${stored.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
    expect(store.listings.rows).toHaveLength(1);
  });
});
