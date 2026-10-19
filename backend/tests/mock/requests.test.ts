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
const DOWN = new Error('MongoDB is unreachable');

function create(): request.Test {
  return request(app).post('/api/requests').set('Authorization', bearer(ME)).send(requestBody());
}

// Interface POST /api/requests
describe('Mocked: POST /api/requests', () => {
  // Input: a valid request
  // Expected status code: 500
  // Expected behavior: the error is logged; nothing is stored
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the requests store rejects the insert with a database error
  test('Database failure', async () => {
    jest.spyOn(store.requests, 'insert').mockRejectedValue(DOWN);

    const response = await create();

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });

  // Input: a valid request
  // Expected status code: 400
  // Expected behavior: the request is rejected; nothing is stored
  // Expected output: { error: "Invalid request", details: [...] }
  // Mocked behavior: the requests store rejects the insert with MongoDB's schema-validation error (code 121), and
  //   with a duplicate-field error
  test('Rejected by the database', async () => {
    const insert = jest.spyOn(store.requests, 'insert');
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
    expect(store.requests.rows).toHaveLength(0);
  });
});

// Interface GET /api/requests and GET /api/requests/:id
describe('Mocked: GET /api/requests', () => {
  // Input: GET /api/requests, then GET /api/requests/:id
  // Expected status code: 500 both times
  // Expected behavior: the error is logged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the requests store rejects the list query and the lookup with a database error
  test('Database failure', async () => {
    jest.spyOn(store.requests, 'listByOwner').mockRejectedValue(DOWN);
    jest.spyOn(store.requests, 'findById').mockRejectedValue(DOWN);

    const list = await request(app).get('/api/requests').set('Authorization', bearer(ME));
    const one = await request(app).get('/api/requests/ffffffffffffffffffffffff').set('Authorization', bearer(ME));

    expect([list.status, one.status]).toEqual([500, 500]);
    expect(list.body).toEqual(SERVER_ERROR);
  });
});

// Interface PATCH /api/requests/:id
describe('Mocked: PATCH /api/requests/:id', () => {
  // Input: PATCH { status: "closed" } on the caller's request
  // Expected status code: 500
  // Expected behavior: the error is logged; the stored request stays open
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the requests store rejects the replace with a database error
  test('Database failure', async () => {
    const stored = await store.requests.insert(newRequest(ME));
    jest.spyOn(store.requests, 'replace').mockRejectedValue(DOWN);

    const response = await request(app)
      .patch(`/api/requests/${stored.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'closed' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
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
    jest.spyOn(store.requests, 'remove').mockRejectedValue(DOWN);

    const response = await request(app).delete(`/api/requests/${stored.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(500);
    expect(store.requests.rows).toHaveLength(1);
  });
});
