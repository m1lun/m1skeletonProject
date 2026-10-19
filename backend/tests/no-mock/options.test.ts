import request from 'supertest';

import { createApp } from '../../src/app';
import type { Option } from '../../src/models/option';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { ME, OTHER, bearer } from '../helpers/postFixtures';

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

function option(field: string, label: string, overrides: Partial<Option> = {}): Option {
  return {
    field,
    key: label.toLowerCase(),
    label,
    builtin: true,
    createdBy: null,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

// Interface GET /api/options
describe('Unmocked: GET /api/options', () => {
  // Input: GET ?field=category; the store holds three categories and one colour
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: the three category options, sorted by label
  test('Lists the options of one field', async () => {
    await store.options.ensureMany([
      option('category', 'Sports'),
      option('category', 'Books'),
      option('category', 'Furniture'),
      option('colour', 'Red'),
    ]);

    const response = await request(app).get('/api/options?field=category').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect((response.body as Option[]).map((item) => item.label)).toEqual(['Books', 'Furniture', 'Sports']);
  });

  // Input: GET ?field=%20Category%20 (different case and spaces)
  // Expected status code: 200
  // Expected behavior: the field name is normalised before the lookup
  // Expected output: the category options
  test('Normalises the field name', async () => {
    await store.options.ensure(option('category', 'Books'));

    const response = await request(app).get('/api/options?field=%20Category%20').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
  });

  // Input: GET ?field=brand for a field with no options
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: []
  test('Field with no options', async () => {
    const response = await request(app).get('/api/options?field=brand').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  // Input: GET with no field parameter, and GET with a blank field
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid request", details: ["field query parameter is required"] }
  test.each(['/api/options', '/api/options?field=', '/api/options?field=%20'])('Missing field: %s', async (url) => {
    const response = await request(app).get(url).set('Authorization', bearer(ME));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: ['field query parameter is required'] });
  });

  // Input: GET without a session token
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing Authorization: Bearer <session token> header" }
  test('Missing session token', async () => {
    const response = await request(app).get('/api/options?field=category');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing Authorization: Bearer <session token> header' });
  });
});

// Interface POST /api/options
describe('Unmocked: POST /api/options', () => {
  // Input: POST { field: "Brand", label: "  Trek  Bikes " }
  // Expected status code: 201
  // Expected behavior: the option is stored under the normalised field and key, created by the caller
  // Expected output: the option, with extra spaces collapsed and builtin false
  test('New option', async () => {
    const response = await request(app)
      .post('/api/options')
      .set('Authorization', bearer(ME))
      .send({ field: 'Brand', label: '  Trek  Bikes ' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      field: 'brand',
      key: 'trek bikes',
      label: 'Trek Bikes',
      builtin: false,
      createdBy: ME,
    });
    expect(store.options.rows).toHaveLength(1);
  });

  // Input: POST the same option twice, the second time in a different case and by another user
  // Expected status code: 201 both times
  // Expected behavior: only one option is stored; the first caller stays its creator
  // Expected output: the existing option both times
  test('Adding an existing option returns it', async () => {
    await request(app).post('/api/options').set('Authorization', bearer(ME)).send({ field: 'brand', label: 'Trek' });

    const response = await request(app)
      .post('/api/options')
      .set('Authorization', bearer(OTHER))
      .send({ field: 'brand', label: 'TREK' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ key: 'trek', label: 'Trek', createdBy: ME });
    expect(store.options.rows).toHaveLength(1);
  });

  // Input: a body that breaks one rule; each case below names the rule
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: ["field and a label of 1 to 60 characters are required"] }
  test.each([
    ['the field is missing', { label: 'Trek' }],
    ['the label is missing', { field: 'brand' }],
    ['the label is blank', { field: 'brand', label: '   ' }],
    ['the label is too long', { field: 'brand', label: 'x'.repeat(61) }],
    ['the label is not text', { field: 'brand', label: 5 }],
  ])('Invalid option: %s', async (_name, body) => {
    const response = await request(app).post('/api/options').set('Authorization', bearer(ME)).send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid request',
      details: ['field and a label of 1 to 60 characters are required'],
    });
    expect(store.options.rows).toHaveLength(0);
  });

  // Input: a label of exactly 60 characters
  // Expected status code: 201
  // Expected behavior: the option is stored
  // Expected output: the option
  test('Label at the length limit', async () => {
    const response = await request(app)
      .post('/api/options')
      .set('Authorization', bearer(ME))
      .send({ field: 'brand', label: 'x'.repeat(60) });

    expect(response.status).toBe(201);
    expect(store.options.rows).toHaveLength(1);
  });

  // Input: a JSON array instead of an object
  // Expected status code: 400
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Invalid request", details: ["field and a label of 1 to 60 characters are required"] }
  test('Body that is a JSON array', async () => {
    const response = await request(app)
      .post('/api/options')
      .set('Authorization', bearer(ME))
      .send([] as unknown as object);

    expect(response.status).toBe(400);
    expect(store.options.rows).toHaveLength(0);
  });

  // Input: POST without a session token
  // Expected status code: 401
  // Expected behavior: request is rejected; database unchanged
  // Expected output: { error: "Missing Authorization: Bearer <session token> header" }
  test('Missing session token', async () => {
    const response = await request(app).post('/api/options').send({ field: 'brand', label: 'Trek' });

    expect(response.status).toBe(401);
    expect(store.options.rows).toHaveLength(0);
  });
});
