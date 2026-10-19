import request from 'supertest';

import { createApp } from '../../src/app';
import type { CustomField } from '../../src/models/customField';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { ME, OTHER, bearer } from '../helpers/postFixtures';

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

// Interface GET /api/custom-fields
describe('Unmocked: GET /api/custom-fields', () => {
  // Input: GET with a session token; the caller saved two custom fields and another user saved one
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: only the caller's two fields
  test('Lists only the caller’s own fields', async () => {
    await store.customFields.upsert({ ownerId: ME, key: 'wall width', label: 'Wall width', type: 'number' });
    await store.customFields.upsert({ ownerId: ME, key: 'pet free', label: 'Pet free', type: 'bool' });
    await store.customFields.upsert({ ownerId: OTHER, key: 'secret', label: 'Secret', type: 'text' });

    const response = await request(app).get('/api/custom-fields').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect((response.body as CustomField[]).map((field) => field.key)).toEqual(['wall width', 'pet free']);
  });

  // Input: GET with a session token; the caller has no fields
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: []
  test('No fields', async () => {
    const response = await request(app).get('/api/custom-fields').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  // Input: GET without a session token
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing Authorization: Bearer <session token> header" }
  test('Missing session token', async () => {
    const response = await request(app).get('/api/custom-fields');

    expect(response.status).toBe(401);
  });
});

// Interface POST /api/custom-fields
describe('Unmocked: POST /api/custom-fields', () => {
  // Input: POST { label: "  Wall   Width ", type: "number" }
  // Expected status code: 201
  // Expected behavior: the field is saved for the caller with a normalised key
  // Expected output: { ownerId, key: "wall width", label: "Wall   Width", type: "number" } with the label trimmed
  test('New field', async () => {
    const response = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', bearer(ME))
      .send({ label: '  Wall   Width ', type: 'number' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ownerId: ME, key: 'wall width', label: 'Wall   Width', type: 'number' });
    expect(store.customFields.rows).toHaveLength(1);
  });

  // Input: POST the same label twice with different types
  // Expected status code: 201 both times
  // Expected behavior: one field is stored; it takes the latest type
  // Expected output: the field with the latest type
  test('Saving the same field again updates it', async () => {
    await request(app).post('/api/custom-fields').set('Authorization', bearer(ME)).send({ label: 'Size', type: 'text' });

    const response = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', bearer(ME))
      .send({ label: 'SIZE', type: 'number' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ key: 'size', type: 'number' });
    expect(store.customFields.rows).toHaveLength(1);
  });

  // Input: POST of a field with each allowed type (text, number, bool)
  // Expected status code: 201
  // Expected behavior: each field is saved
  // Expected output: the field with its type
  test.each(['text', 'number', 'bool'])('Allowed type %s', async (type) => {
    const response = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', bearer(ME))
      .send({ label: 'Extra', type });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ type });
  });

  // Input: a body that breaks one rule; each case below names the rule
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: [the message for that rule] }
  test.each([
    ['the label is missing', { type: 'text' }, 'label must be 1 to 60 characters'],
    ['the label is blank', { label: '  ', type: 'text' }, 'label must be 1 to 60 characters'],
    ['the label is too long', { label: 'x'.repeat(61), type: 'text' }, 'label must be 1 to 60 characters'],
    [
      'the label is a built-in field',
      { label: 'Price', type: 'number' },
      '"Price" is already a built-in field, so there is no need to add it',
    ],
    ['the type is missing', { label: 'Extra' }, 'type must be one of: text, number, bool'],
    ['the type is unknown', { label: 'Extra', type: 'dimensions' }, 'type must be one of: text, number, bool'],
  ])('Invalid field: %s', async (_name, body, message) => {
    const response = await request(app).post('/api/custom-fields').set('Authorization', bearer(ME)).send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: [message] });
    expect(store.customFields.rows).toHaveLength(0);
  });

  // Input: a body with both a bad label and a bad type
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: [both messages] }
  test('Reports both problems', async () => {
    const response = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', bearer(ME))
      .send({ label: '', type: 'nope' });

    expect(response.status).toBe(400);
    expect((response.body as { details: string[] }).details).toHaveLength(2);
  });

  // Input: a JSON array instead of an object
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: [label and type messages] }
  test('Body that is a JSON array', async () => {
    const response = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', bearer(ME))
      .send([] as unknown as object);

    expect(response.status).toBe(400);
    expect(store.customFields.rows).toHaveLength(0);
  });
});

// Interface DELETE /api/custom-fields/:key
describe('Unmocked: DELETE /api/custom-fields/:key', () => {
  // Input: DELETE /api/custom-fields/Wall%20Width for the caller's field "wall width"
  // Expected status code: 204
  // Expected behavior: the field is removed (the key is normalised first); the caller's other field remains
  // Expected output: empty body
  test('Own field', async () => {
    await store.customFields.upsert({ ownerId: ME, key: 'wall width', label: 'Wall width', type: 'number' });
    await store.customFields.upsert({ ownerId: ME, key: 'pet free', label: 'Pet free', type: 'bool' });

    const response = await request(app).delete('/api/custom-fields/Wall%20Width').set('Authorization', bearer(ME));

    expect(response.status).toBe(204);
    expect(store.customFields.rows.map((field) => field.key)).toEqual(['pet free']);
  });

  // Input: DELETE of a key that does not exist
  // Expected status code: 404
  // Expected behavior: database unchanged
  // Expected output: { error: "Not Found" }
  test('Unknown key', async () => {
    const response = await request(app).delete('/api/custom-fields/nothing').set('Authorization', bearer(ME));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found' });
  });

  // Input: DELETE of a key that only another user has saved
  // Expected status code: 404
  // Expected behavior: the other user's field is not removed
  // Expected output: { error: "Not Found" }
  test('Another user’s field', async () => {
    await store.customFields.upsert({ ownerId: OTHER, key: 'secret', label: 'Secret', type: 'text' });

    const response = await request(app).delete('/api/custom-fields/secret').set('Authorization', bearer(ME));

    expect(response.status).toBe(404);
    expect(store.customFields.rows).toHaveLength(1);
  });

  // Input: DELETE without a session token
  // Expected status code: 401
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Missing Authorization: Bearer <session token> header" }
  test('Missing session token', async () => {
    const response = await request(app).delete('/api/custom-fields/secret');

    expect(response.status).toBe(401);
  });
});
