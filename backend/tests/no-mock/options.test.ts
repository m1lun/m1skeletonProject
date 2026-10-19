import request from 'supertest';

import { createApp } from '../../src/app';
import type { Option } from '../../src/models/option';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { ME, OTHER, bearer } from '../helpers/postFixtures';

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

// Interface GET /api/options
describe('Unmocked: GET /api/options', () => {
  // Input: GET ?field=Category; the store holds two categories and one colour
  // Expected status code: 200
  // Expected behavior: the field name is normalised; database unchanged
  // Expected output: the two category options, sorted by label
  test('Lists the options of one field', async () => {
    const base = { builtin: true, createdBy: null, createdAt: new Date() };
    await store.options.ensureMany([
      { ...base, field: 'category', key: 'sports', label: 'Sports' },
      { ...base, field: 'category', key: 'books', label: 'Books' },
      { ...base, field: 'colour', key: 'red', label: 'Red' },
    ]);

    const response = await request(app).get('/api/options?field=Category').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect((response.body as Option[]).map((item) => item.label)).toEqual(['Books', 'Sports']);
  });

  // Input: GET with no field parameter
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid request", details: ["field query parameter is required"] }
  test('Missing field', async () => {
    const response = await request(app).get('/api/options').set('Authorization', bearer(ME));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['field query parameter is required'] });
  });
});

// Interface POST /api/options
describe('Unmocked: POST /api/options', () => {
  // Input: POST { field: "Brand", label: "  Trek  Bikes " } by one user, then { field: "brand", label: "TREK BIKES" } by another
  // Expected status code: 201 both times
  // Expected behavior: one option is stored, with spaces collapsed; the first caller stays its creator
  // Expected output: the option { field: "brand", key: "trek bikes", label: "Trek Bikes", builtin: false }
  test('New option, then the same option again', async () => {
    const first = await request(app)
      .post('/api/options')
      .set('Authorization', bearer(ME))
      .send({ field: 'Brand', label: '  Trek  Bikes ' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ field: 'brand', key: 'trek bikes', label: 'Trek Bikes', builtin: false, createdBy: ME });

    const again = await request(app)
      .post('/api/options')
      .set('Authorization', bearer(OTHER))
      .send({ field: 'brand', label: 'TREK BIKES' });
    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ label: 'Trek Bikes', createdBy: ME });
    expect(store.options.rows).toHaveLength(1);
  });

  // Input: POST with a blank label, and POST with a label over 60 characters
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: ["field and a label of 1 to 60 characters are required"] }
  test.each([['blank', ' '], ['too long', 'x'.repeat(61)]])('Invalid label: %s', async (_name, label) => {
    const response = await request(app).post('/api/options').set('Authorization', bearer(ME)).send({ field: 'brand', label });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid request',
      details: ['field and a label of 1 to 60 characters are required'],
    });
    expect(store.options.rows).toHaveLength(0);
  });
});
