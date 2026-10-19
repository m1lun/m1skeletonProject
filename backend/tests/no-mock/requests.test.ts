import request from 'supertest';

import { createApp } from '../../src/app';
import type { BuyerRequest } from '../../src/models/request';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { ME, OTHER, PHOTO_ID, bearer, newRequest, requestBody } from '../helpers/postFixtures';

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

function create(body: unknown): request.Test {
  return request(app).post('/api/requests').set('Authorization', bearer(ME)).send(body as object);
}

function patch(id: string, body: unknown, userId = ME): request.Test {
  return request(app).patch(`/api/requests/${id}`).set('Authorization', bearer(userId)).send(body as object);
}

// Interface POST /api/requests
describe('Unmocked: POST /api/requests', () => {
  // Input: a valid request with max price, min condition and colour fields and one reference photo
  // Expected status code: 201
  // Expected behavior: stored as open and owned by the caller
  // Expected output: the stored request, with each built-in field given its label and type
  test('Valid request', async () => {
    const response = await create(requestBody({ photoIds: [PHOTO_ID] }));

    expect(response.status).toBe(201);
    const created = response.body as BuyerRequest;
    expect(created).toMatchObject({ ownerId: ME, status: 'open', photoIds: [PHOTO_ID] });
    expect(created.requestFields.map((field) => [field.key, field.label, field.hard])).toEqual([
      ['price', 'Max price', true],
      ['condition', 'Min condition', false],
      ['colour', 'Colour', false],
    ]);
    expect(store.requests.rows).toHaveLength(1);
  });

  // Input: a request that breaks one rule; each case names the rule
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: [the message for that rule] }
  test.each([
    ['category is missing', { category: undefined }, 'category is required'],
    ['the fields are missing', { requestFields: undefined }, 'requestFields must be an array'],
    ['the max price is missing', { requestFields: [] }, 'a max price is required'],
    [
      'the min condition is unknown',
      {
        requestFields: [
          { kind: 'builtin', key: 'price', value: 10, hard: true },
          { kind: 'builtin', key: 'condition', value: 'mint', hard: false },
        ],
      },
      'min condition must be one of: new, like new, good, fair, poor',
    ],
    [
      'a built-in field is unknown',
      { requestFields: [{ kind: 'builtin', key: 'weight', value: 3 }] },
      'requestFields[0] has an unknown field "weight"',
    ],
  ])('Invalid request: %s', async (_name, overrides, message) => {
    const response = await create(requestBody(overrides));

    expect(response.status).toBe(400);
    expect((response.body as { details: string[] }).details).toContain(message);
    expect(store.requests.rows).toHaveLength(0);
  });
});

// Interface GET /api/requests and GET /api/requests/:id
describe('Unmocked: GET /api/requests', () => {
  // Input: GET with a session token; the store holds two of the caller's requests and one from another user
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: only the caller's two requests, newest first
  test('Lists only the caller’s own requests', async () => {
    const older = await store.requests.insert(newRequest(ME));
    const newer = await store.requests.insert(newRequest(ME));
    await store.requests.insert(newRequest(OTHER));

    const response = await request(app).get('/api/requests').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect((response.body as BuyerRequest[]).map((item) => item.id)).toEqual([newer.id, older.id]);
  });

  // Input: GET /api/requests/:id for the caller's request, one from another user, and an unknown id
  // Expected status code: 200, 403, 404
  // Expected behavior: database unchanged; another user's request is not revealed
  // Expected output: the request, { error: "Forbidden" }, { error: "Not Found" }
  test('Get by id', async () => {
    const own = await store.requests.insert(newRequest(ME));
    const theirs = await store.requests.insert(newRequest(OTHER));
    const get = (id: string): request.Test => request(app).get(`/api/requests/${id}`).set('Authorization', bearer(ME));

    expect((await get(own.id)).status).toBe(200);
    expect((await get(theirs.id)).status).toBe(403);
    expect((await get('ffffffffffffffffffffffff')).status).toBe(404);
  });
});

// Interface PATCH /api/requests/:id
describe('Unmocked: PATCH /api/requests/:id', () => {
  // Input: PATCH { description: "A bigger desk" }, then { status: "closed" }, then { status: "open" }
  // Expected status code: 200 each time
  // Expected behavior: the request is edited, closed and reopened
  // Expected output: the updated request
  test('Edit, close and reopen', async () => {
    const item = await store.requests.insert(newRequest(ME));

    expect((await patch(item.id, { description: 'A bigger desk' })).body).toMatchObject({ description: 'A bigger desk' });
    expect((await patch(item.id, { status: 'closed' })).body).toMatchObject({ status: 'closed' });
    expect((await patch(item.id, { status: 'open' })).body).toMatchObject({ status: 'open' });
  });

  // Input: PATCH { requestFields: [] } (removes the required max price)
  // Expected status code: 400
  // Expected behavior: request is rejected; the stored request is unchanged
  // Expected output: { error: "Invalid request", details: ["a max price is required"] }
  test('Invalid change', async () => {
    const item = await store.requests.insert(newRequest(ME));

    const response = await patch(item.id, { requestFields: [] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['a max price is required'] });
    expect(store.requests.rows[0]?.requestFields).toHaveLength(1);
  });

  // Input: PATCH of a request owned by another user
  // Expected status code: 403
  // Expected behavior: the request is unchanged
  // Expected output: { error: "Forbidden" }
  test('Another user’s request', async () => {
    const item = await store.requests.insert(newRequest(OTHER));

    const response = await patch(item.id, { status: 'closed' });

    expect(response.status).toBe(403);
    expect(store.requests.rows[0]?.status).toBe('open');
  });
});

// Interface DELETE /api/requests/:id
describe('Unmocked: DELETE /api/requests/:id', () => {
  // Input: DELETE of the caller's request, then of a request owned by another user
  // Expected status code: 204, then 403
  // Expected behavior: the caller's request is removed; the other user's request is not
  // Expected output: empty body, then { error: "Forbidden" }
  test('Own and another user’s request', async () => {
    const own = await store.requests.insert(newRequest(ME));
    const theirs = await store.requests.insert(newRequest(OTHER));
    const remove = (id: string): request.Test =>
      request(app).delete(`/api/requests/${id}`).set('Authorization', bearer(ME));

    expect((await remove(own.id)).status).toBe(204);
    expect((await remove(theirs.id)).status).toBe(403);
    expect(store.requests.rows.map((row) => row.id)).toEqual([theirs.id]);
  });
});
