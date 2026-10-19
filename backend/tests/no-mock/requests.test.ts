import request from 'supertest';

import { createApp } from '../../src/app';
import type { BuyerRequest } from '../../src/models/request';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { ME, OTHER, PHOTO_ID, bearer, newRequest, requestBody } from '../helpers/postFixtures';

// Each test starts from an empty store and the store is thrown away afterwards.
let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

function create(body: unknown, userId = ME): request.Test {
  return request(app).post('/api/requests').set('Authorization', bearer(userId)).send(body as object);
}

// Interface POST /api/requests
describe('Unmocked: POST /api/requests', () => {
  // Input: a valid request (category, description, address, location, no photos, and max price,
  //   min condition and colour fields)
  // Expected status code: 201
  // Expected behavior: the request is stored as open and owned by the caller
  // Expected output: the stored request, with an id, ownerId, status "open", and each built-in
  //   field given its label and type
  test('Valid request', async () => {
    const response = await create(requestBody());

    expect(response.status).toBe(201);
    const created = response.body as BuyerRequest;
    expect(created).toMatchObject({
      ownerId: ME,
      category: 'Furniture',
      status: 'open',
      photoIds: [],
      location: { type: 'Point', coordinates: [-123.25, 49.26] },
    });
    expect(created.requestFields.map((field) => [field.key, field.label, field.type, field.hard])).toEqual([
      ['price', 'Max price', 'number', true],
      ['condition', 'Min condition', 'text', false],
      ['colour', 'Colour', 'text', false],
    ]);
    expect(store.requests.rows).toHaveLength(1);
  });

  // Input: a request with only a category, address, location and a max price
  // Expected status code: 201
  // Expected behavior: the request is stored; the description is empty and there are no photos
  // Expected output: the stored request
  test('Only required fields', async () => {
    const response = await create(
      requestBody({
        description: undefined,
        requestFields: [{ kind: 'builtin', key: 'price', value: 50, hard: true }],
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ description: '', photoIds: [] });
  });

  // Input: a valid request with one reference photo id
  // Expected status code: 201
  // Expected behavior: the request is stored with the photo id
  // Expected output: the stored request with photoIds [the id]
  test('Reference photo', async () => {
    const response = await create(requestBody({ photoIds: [PHOTO_ID] }));

    expect(response.status).toBe(201);
    expect((response.body as BuyerRequest).photoIds).toEqual([PHOTO_ID]);
  });

  // Input: a valid request with a custom number field "Wall width" and a brand
  // Expected status code: 201
  // Expected behavior: the category, brand and custom field are remembered for next time
  // Expected output: the stored request
  test('Remembers new values for next time', async () => {
    const fields = [
      { kind: 'builtin', key: 'price', value: 100, hard: true },
      { kind: 'builtin', key: 'brand', value: 'IKEA', hard: false, importance: 3 },
      { kind: 'custom', label: 'Wall width', type: 'number', value: 150, hard: true },
    ];

    const response = await create(requestBody({ category: 'Shelves', requestFields: fields }));

    expect(response.status).toBe(201);
    expect(store.options.rows.map((option) => [option.field, option.key])).toEqual(
      expect.arrayContaining([
        ['category', 'shelves'],
        ['brand', 'ikea'],
      ]),
    );
    expect(store.customFields.rows).toEqual([{ ownerId: ME, key: 'wall width', label: 'Wall width', type: 'number' }]);
  });

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Missing Authorization: Bearer <session token> header" }
  test('Missing session token', async () => {
    const response = await request(app).post('/api/requests').send(requestBody());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing Authorization: Bearer <session token> header' });
    expect(store.requests.rows).toHaveLength(0);
  });

  // Input: a request that breaks one rule; each case below names the rule
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: [the message for that rule] }
  test.each([
    ['category is missing', { category: undefined }, 'category is required'],
    ['address is blank', { address: ' ' }, 'address is required'],
    ['description is not a string', { description: 1 }, 'description must be a string'],
    ['location is missing', { location: undefined }, 'location must be { longitude, latitude }'],
    ['location is out of range', { location: { longitude: -181, latitude: 0 } }, 'location is out of range'],
    [
      'a photo id is malformed',
      { photoIds: ['zzz'] },
      'photoIds must be an array of ids returned by POST /api/photos',
    ],
    [
      'there are more than 10 photos',
      { photoIds: Array.from({ length: 11 }, () => PHOTO_ID) },
      'at most 10 photos are allowed',
    ],
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
    [
      'a custom field has no label',
      { requestFields: [{ kind: 'custom', type: 'text', value: 'x' }] },
      'requestFields[0] needs a label',
    ],
    [
      'a custom field reuses a built-in name',
      { requestFields: [{ kind: 'custom', label: 'Colour', type: 'text', value: 'x' }] },
      '"Colour" is already a built-in field, so there is no need to add it as a custom field',
    ],
  ])('Invalid request: %s', async (_name, overrides, message) => {
    const response = await create(requestBody(overrides));

    expect(response.status).toBe(400);
    const body = response.body as { error: string; details: string[] };
    expect(body.error).toBe('Invalid request');
    expect(body.details).toContain(message);
    expect(store.requests.rows).toHaveLength(0);
  });

  // Input: a request body that is not valid JSON
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Malformed request body" }
  test('Malformed JSON', async () => {
    const response = await request(app)
      .post('/api/requests')
      .set('Authorization', bearer(ME))
      .set('Content-Type', 'application/json')
      .send('{"category": ');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Malformed request body' });
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

  // Input: GET with a session token; the caller has no requests
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: []
  test('No requests', async () => {
    const response = await request(app).get('/api/requests').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});

describe('Unmocked: GET /api/requests/:id', () => {
  // Input: GET of the caller's own request
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: the request
  test('Own request', async () => {
    const item = await store.requests.insert(newRequest(ME));

    const response = await request(app).get(`/api/requests/${item.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect((response.body as BuyerRequest).id).toBe(item.id);
  });

  // Input: GET of an id that does not exist
  // Expected status code: 404
  // Expected behavior: database unchanged
  // Expected output: { error: "Not Found" }
  test('Unknown id', async () => {
    const response = await request(app).get('/api/requests/ffffffffffffffffffffffff').set('Authorization', bearer(ME));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found' });
  });

  // Input: GET of a request owned by another user
  // Expected status code: 403
  // Expected behavior: database unchanged; the request is not revealed
  // Expected output: { error: "Forbidden" }
  test('Another user’s request', async () => {
    const item = await store.requests.insert(newRequest(OTHER));

    const response = await request(app).get(`/api/requests/${item.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
  });
});

// Interface PATCH /api/requests/:id
describe('Unmocked: PATCH /api/requests/:id', () => {
  // Input: PATCH { description: "A bigger desk", requestFields: [max price 150] } on the caller's request
  // Expected status code: 200
  // Expected behavior: the request is updated in the database
  // Expected output: the updated request
  test('Edit fields', async () => {
    const item = await store.requests.insert(newRequest(ME));

    const response = await request(app)
      .patch(`/api/requests/${item.id}`)
      .set('Authorization', bearer(ME))
      .send({
        description: 'A bigger desk',
        requestFields: [{ kind: 'builtin', key: 'price', value: 150, hard: true }],
      });

    expect(response.status).toBe(200);
    const updated = response.body as BuyerRequest;
    expect(updated.description).toBe('A bigger desk');
    expect(updated.requestFields[0]).toMatchObject({ key: 'price', value: 150 });
    expect(store.requests.rows[0]?.description).toBe('A bigger desk');
  });

  // Input: PATCH { status: "closed" }, then PATCH { status: "open" }
  // Expected status code: 200 each time
  // Expected behavior: the request is closed and then reopened; its fields are unchanged
  // Expected output: the request with the new status
  test('Close and reopen', async () => {
    const item = await store.requests.insert(newRequest(ME));

    const closed = await request(app)
      .patch(`/api/requests/${item.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'closed' });
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({ status: 'closed', description: 'Looking for a desk' });

    const reopened = await request(app)
      .patch(`/api/requests/${item.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'open' });
    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({ status: 'open' });
  });

  // Input: PATCH { status: "sold" }
  // Expected status code: 400
  // Expected behavior: request is rejected; the stored request is unchanged
  // Expected output: { error: "Invalid request", details: ['status must be "open" or "closed"'] }
  test('Invalid status', async () => {
    const item = await store.requests.insert(newRequest(ME));

    const response = await request(app)
      .patch(`/api/requests/${item.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'sold' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['status must be "open" or "closed"'] });
    expect(store.requests.rows[0]?.status).toBe('open');
  });

  // Input: PATCH { requestFields: [] } (removes the required max price)
  // Expected status code: 400
  // Expected behavior: request is rejected; the stored request is unchanged
  // Expected output: { error: "Invalid request", details: ["a max price is required"] }
  test('Invalid change', async () => {
    const item = await store.requests.insert(newRequest(ME));

    const response = await request(app)
      .patch(`/api/requests/${item.id}`)
      .set('Authorization', bearer(ME))
      .send({ requestFields: [] });

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

    const response = await request(app)
      .patch(`/api/requests/${item.id}`)
      .set('Authorization', bearer(ME))
      .send({ status: 'closed' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    expect(store.requests.rows[0]?.status).toBe('open');
  });

  // Input: PATCH of an id that does not exist
  // Expected status code: 404
  // Expected behavior: database unchanged
  // Expected output: { error: "Not Found" }
  test('Unknown id', async () => {
    const response = await request(app)
      .patch('/api/requests/ffffffffffffffffffffffff')
      .set('Authorization', bearer(ME))
      .send({ status: 'closed' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found' });
  });
});

// Interface DELETE /api/requests/:id
describe('Unmocked: DELETE /api/requests/:id', () => {
  // Input: DELETE of the caller's own request
  // Expected status code: 204
  // Expected behavior: the request is removed; the caller's other request remains
  // Expected output: empty body
  test('Own request', async () => {
    const doomed = await store.requests.insert(newRequest(ME));
    const kept = await store.requests.insert(newRequest(ME));

    const response = await request(app).delete(`/api/requests/${doomed.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(204);
    expect(store.requests.rows.map((row) => row.id)).toEqual([kept.id]);
  });

  // Input: DELETE of a request owned by another user
  // Expected status code: 403
  // Expected behavior: the request is not removed
  // Expected output: { error: "Forbidden" }
  test('Another user’s request', async () => {
    const item = await store.requests.insert(newRequest(OTHER));

    const response = await request(app).delete(`/api/requests/${item.id}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    expect(store.requests.rows).toHaveLength(1);
  });

  // Input: DELETE of an id that does not exist
  // Expected status code: 404
  // Expected behavior: database unchanged
  // Expected output: { error: "Not Found" }
  test('Unknown id', async () => {
    const response = await request(app)
      .delete('/api/requests/ffffffffffffffffffffffff')
      .set('Authorization', bearer(ME));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found' });
  });
});
