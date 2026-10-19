import request from 'supertest';

import { createApp } from '../../src/app';
import type { BuyerRequest } from '../../src/models/request';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { ME, PHOTO_ID, bearer, requestBody } from '../helpers/postFixtures';

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

function create(body: unknown): request.Test {
  return request(app).post('/api/requests').set('Authorization', bearer(ME)).send(body as object);
}

describe('Unmocked: POST /api/requests', () => {
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
