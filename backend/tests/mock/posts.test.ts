import request from 'supertest';

import { createApp } from '../../src/app';
import { DuplicateFieldError } from '../../src/models/normalise';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { POST_KINDS } from '../helpers/postKinds';
import { ME, bearer } from '../helpers/postFixtures';

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
const MISSING_ID = 'ffffffffffffffffffffffff';

describe.each(POST_KINDS)('Mocked: POST /api/$path', (kind) => {
  const create = (): request.Test =>
    request(app).post(`/api/${kind.path}`).set('Authorization', bearer(ME)).send(kind.body());

  test('Database failure', async () => {
    jest.spyOn(kind.collection(store), 'insert').mockRejectedValue(DOWN);

    const response = await create();

    expect(response.status).toBe(500);
    expect(response.body).toEqual(SERVER_ERROR);
  });

  test('Rejected by the database', async () => {
    const insert = jest.spyOn(kind.collection(store), 'insert');
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
    expect(kind.collection(store).rows).toHaveLength(0);
  });
});

describe.each(POST_KINDS)('Mocked: GET, PATCH and DELETE /api/$path', (kind) => {
  test('Database failure', async () => {
    const post = await kind.seed(store, ME);
    const collection = kind.collection(store);
    const auth = { Authorization: bearer(ME) };

    jest.spyOn(collection, 'listByOwner').mockRejectedValue(DOWN);
    const list = await request(app).get(`/api/${kind.path}`).set(auth);
    jest.spyOn(collection, 'findById').mockRejectedValueOnce(DOWN);
    const get = await request(app).get(`/api/${kind.path}/${MISSING_ID}`).set(auth);
    jest.spyOn(collection, 'replace').mockRejectedValue(DOWN);
    const patch = await request(app).patch(`/api/${kind.path}/${post.id}`).set(auth).send({ status: 'closed' });
    jest.spyOn(collection, 'remove').mockRejectedValue(DOWN);
    const remove = await request(app).delete(`/api/${kind.path}/${post.id}`).set(auth);

    expect([list.status, get.status, patch.status, remove.status]).toEqual([500, 500, 500, 500]);
    expect(list.body).toEqual(SERVER_ERROR);
    expect(collection.rows).toMatchObject([{ id: post.id, status: 'open' }]);
  });
});
