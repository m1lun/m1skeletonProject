import request from 'supertest';

import { createApp } from '../../src/app';
import { DuplicateFieldError } from '../../src/models/normalise';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { ME, bearer, newRequest, requestBody } from '../helpers/postFixtures';

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

// Interface POST /api/requests
describe('Mocked: POST /api/requests', () => {
  // Input: a valid request
  // Expected status code: 500
  // Expected behavior: the error is logged; the client gets no details
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the requests store rejects the insert with a database error
  test('Database failure on insert', async () => {
    jest.spyOn(store.requests, 'insert').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).post('/api/requests').set('Authorization', bearer(ME)).send(requestBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });

  // Input: a valid request
  // Expected status code: 500
  // Expected behavior: the error is logged; the client gets no details
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the options store rejects when the new category is remembered
  test('Database failure while remembering options', async () => {
    jest.spyOn(store.options, 'ensure').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).post('/api/requests').set('Authorization', bearer(ME)).send(requestBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });

  // Input: a valid request
  // Expected status code: 400
  // Expected behavior: the request is rejected; nothing is stored
  // Expected output: { error: "Invalid request", details: ["a field is outside its allowed values or length"] }
  // Mocked behavior: the requests store rejects the insert with MongoDB's document-validation error (code 121)
  test('Document fails the database schema', async () => {
    jest.spyOn(store.requests, 'insert').mockRejectedValue(
      Object.assign(new Error('Document failed validation'), { code: DOCUMENT_VALIDATION_FAILED }),
    );

    const response = await request(app).post('/api/requests').set('Authorization', bearer(ME)).send(requestBody());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid request',
      details: ['a field is outside its allowed values or length'],
    });
    expect(store.requests.rows).toHaveLength(0);
  });

  // Input: a valid request
  // Expected status code: 400
  // Expected behavior: the request is rejected; nothing is stored
  // Expected output: { error: "Invalid request", details: ['Duplicate field "colour"'] }
  // Mocked behavior: the requests store rejects the insert because two fields normalise to the same key
  test('Duplicate field', async () => {
    jest.spyOn(store.requests, 'insert').mockRejectedValue(new DuplicateFieldError('Duplicate field "colour"'));

    const response = await request(app).post('/api/requests').set('Authorization', bearer(ME)).send(requestBody());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['Duplicate field "colour"'] });
  });
});

// Interface GET /api/requests and GET /api/requests/:id
describe('Mocked: GET /api/requests', () => {
  // Input: GET with a session token
  // Expected status code: 500
  // Expected behavior: the error is logged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the requests store rejects the listing query with a database error
  test('Database failure', async () => {
    jest.spyOn(store.requests, 'listByOwner').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).get('/api/requests').set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });
});

describe('Mocked: GET /api/requests/:id', () => {
  // Input: GET of an id
  // Expected status code: 500
  // Expected behavior: the error is logged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the requests store rejects the lookup with a database error
  test('Database failure', async () => {
    jest.spyOn(store.requests, 'findById').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).get(`/api/requests/${MISSING_ID}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });
});

// Interface PATCH /api/requests/:id
describe('Mocked: PATCH /api/requests/:id', () => {
  // Input: PATCH { status: "closed" } on the caller's request
  // Expected status code: 500
  // Expected behavior: the error is logged; the stored request is unchanged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the requests store rejects the lookup with a database error
  test('Database failure on lookup', async () => {
    jest.spyOn(store.requests, 'findById').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app)
      .patch(`/api/requests/${MISSING_ID}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'closed' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });

  // Input: PATCH { status: "closed" } on the caller's request
  // Expected status code: 500
  // Expected behavior: the error is logged; the stored request stays open
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the requests store rejects the replace with a database error
  test('Database failure on replace', async () => {
    const stored = await store.requests.insert(newRequest(ME));
    jest.spyOn(store.requests, 'replace').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app)
      .patch(`/api/requests/${stored.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'closed' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
    expect(store.requests.rows[0]?.status).toBe('open');
  });

  // Input: PATCH { status: "closed" } on the caller's request
  // Expected status code: 400
  // Expected behavior: the edit is rejected; the stored request stays open
  // Expected output: { error: "Invalid request", details: ['Duplicate field "colour"'] }
  // Mocked behavior: the requests store rejects the replace because two fields normalise to the same key
  test('Duplicate field on replace', async () => {
    const stored = await store.requests.insert(newRequest(ME));
    jest.spyOn(store.requests, 'replace').mockRejectedValue(new DuplicateFieldError('Duplicate field "colour"'));

    const response = await request(app)
      .patch(`/api/requests/${stored.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'closed' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['Duplicate field "colour"'] });
    expect(store.requests.rows[0]?.status).toBe('open');
  });
});

// Interface DELETE /api/requests/:id
describe('Mocked: DELETE /api/requests/:id', () => {
  // Input: DELETE of the caller's own request
  // Expected status code: 500
  // Expected behavior: the error is logged; the request is not removed
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the requests store rejects the removal with a database error
  test('Database failure', async () => {
    const stored = await store.requests.insert(newRequest(ME));
    jest.spyOn(store.requests, 'remove').mockRejectedValue(new Error('MongoDB is unreachable'));

    const response = await request(app).delete(`/api/requests/${stored.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
    expect(store.requests.rows).toHaveLength(1);
  });
});
