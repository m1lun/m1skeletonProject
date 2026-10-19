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

describe('Unmocked: GET /api/custom-fields', () => {
  test('Lists only the caller’s own fields', async () => {
    await store.customFields.upsert({ ownerId: ME, key: 'wall width', label: 'Wall width', type: 'number' });
    await store.customFields.upsert({ ownerId: OTHER, key: 'secret', label: 'Secret', type: 'text' });

    const response = await request(app).get('/api/custom-fields').set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect((response.body as CustomField[]).map((field) => field.key)).toEqual(['wall width']);
  });
});

describe('Unmocked: POST /api/custom-fields', () => {
  test('New field, then the same field again', async () => {
    const first = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', bearer(ME))
      .send({ label: '  Wall   Width ', type: 'number' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ ownerId: ME, key: 'wall width', type: 'number' });

    const again = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', bearer(ME))
      .send({ label: 'Wall Width', type: 'text' });
    expect(again.body).toMatchObject({ key: 'wall width', type: 'text' });
    expect(store.customFields.rows).toHaveLength(1);
  });

  test.each([
    ['the label is blank', { label: ' ', type: 'text' }, 'label must be 1 to 60 characters'],
    [
      'the label is a built-in field',
      { label: 'Price', type: 'number' },
      '"Price" is already a built-in field, so there is no need to add it',
    ],
    ['the type is unknown', { label: 'Extra', type: 'dimensions' }, 'type must be one of: text, number, bool'],
  ])('Invalid field: %s', async (_name, body, message) => {
    const response = await request(app).post('/api/custom-fields').set('Authorization', bearer(ME)).send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request', details: [message] });
    expect(store.customFields.rows).toHaveLength(0);
  });
});

describe('Unmocked: DELETE /api/custom-fields/:key', () => {
  test('Own field and another user’s field', async () => {
    await store.customFields.upsert({ ownerId: ME, key: 'wall width', label: 'Wall width', type: 'number' });
    await store.customFields.upsert({ ownerId: OTHER, key: 'secret', label: 'Secret', type: 'text' });
    const remove = (key: string): request.Test =>
      request(app).delete(`/api/custom-fields/${key}`).set('Authorization', bearer(ME));

    expect((await remove('Wall%20Width')).status).toBe(204);
    const other = await remove('secret');
    expect(other.status).toBe(404);
    expect(other.body).toEqual({ error: 'Not Found' });
    expect(store.customFields.rows.map((field) => field.key)).toEqual(['secret']);
  });
});
