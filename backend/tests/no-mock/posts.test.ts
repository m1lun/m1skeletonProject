import request from 'supertest';

import { createApp } from '../../src/app';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { POST_KINDS, type TestPost } from '../helpers/postKinds';
import { ME, OTHER, bearer } from '../helpers/postFixtures';

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

const MISSING_ID = 'ffffffffffffffffffffffff';

describe.each(POST_KINDS)('Unmocked: GET /api/$path', (kind) => {
  test('Lists only the caller’s own posts', async () => {
    const older = await kind.seed(store, ME);
    const newer = await kind.seed(store, ME);
    await kind.seed(store, OTHER);

    const response = await request(app).get(`/api/${kind.path}`).set('Authorization', bearer(ME));

    expect(response.status).toBe(200);
    expect((response.body as TestPost[]).map((post) => post.id)).toEqual([newer.id, older.id]);
  });

  test('Get by id', async () => {
    const own = await kind.seed(store, ME);
    const theirs = await kind.seed(store, OTHER);
    const get = (id: string): request.Test => request(app).get(`/api/${kind.path}/${id}`).set('Authorization', bearer(ME));

    const found = await get(own.id);
    expect(found.status).toBe(200);
    expect((found.body as TestPost).id).toBe(own.id);
    const forbidden = await get(theirs.id);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: 'Forbidden' });
    const missing = await get(MISSING_ID);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Not Found' });
  });
});

describe.each(POST_KINDS)('Unmocked: PATCH /api/$path/:id', (kind) => {
  const patch = (id: string, body: unknown, userId = ME): request.Test =>
    request(app).patch(`/api/${kind.path}/${id}`).set('Authorization', bearer(userId)).send(body as object);

  test('Edit, close and reopen', async () => {
    const post = await kind.seed(store, ME);

    expect((await patch(post.id, { description: 'Changed' })).body).toMatchObject({ description: 'Changed' });
    expect((await patch(post.id, { status: 'closed' })).body).toMatchObject({ status: 'closed' });
    expect((await patch(post.id, { status: 'open' })).body).toMatchObject({ status: 'open' });
  });

  test('Invalid change', async () => {
    const post = await kind.seed(store, ME);

    const status = await patch(post.id, { status: 'sold' });
    expect(status.status).toBe(400);
    expect(status.body).toEqual({ error: 'Invalid request', details: ['status must be "open" or "closed"'] });

    const change = await patch(post.id, kind.invalidChange);
    expect(change.status).toBe(400);
    expect(change.body).toEqual({ error: 'Invalid request', details: [kind.invalidMessage] });
    expect(kind.collection(store).rows[0]?.status).toBe('open');
  });

  test('Another user’s post', async () => {
    const post = await kind.seed(store, OTHER);

    const response = await patch(post.id, { status: 'closed' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    expect(kind.collection(store).rows[0]?.status).toBe('open');
  });
});

describe.each(POST_KINDS)('Unmocked: DELETE /api/$path/:id', (kind) => {
  test('Own and another user’s post', async () => {
    const own = await kind.seed(store, ME);
    const theirs = await kind.seed(store, OTHER);
    const remove = (id: string): request.Test => request(app).delete(`/api/${kind.path}/${id}`).set('Authorization', bearer(ME));

    expect((await remove(own.id)).status).toBe(204);
    const forbidden = await remove(theirs.id);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: 'Forbidden' });
    expect(kind.collection(store).rows.map((row) => row.id)).toEqual([theirs.id]);
  });
});
