import type { Readable } from 'node:stream';

import request from 'supertest';

import { createApp } from '../../src/app';
import { MAX_PHOTO_BYTES } from '../../src/models/common';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { ME, bearer } from '../helpers/postFixtures';

const IMAGE = Buffer.from('fake image bytes');
const BAD_REQUEST = { error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' };

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

function upload(files: { data: Buffer; type: string }[]): request.Test {
  let pending = request(app).post('/api/photos').set('Authorization', bearer(ME));
  for (const [index, file] of files.entries()) {
    pending = pending.attach('photos', file.data, { filename: `photo${index}`, contentType: file.type });
  }
  return pending;
}

describe('Unmocked: POST /api/photos', () => {
  test('Valid photos', async () => {
    const response = await upload([
      { data: IMAGE, type: 'image/jpeg' },
      { data: IMAGE, type: 'image/png' },
    ]);

    expect(response.status).toBe(201);
    const { ids } = response.body as { ids: string[] };
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^[0-9a-f]{24}$/);
    expect(store.photos.photos.get(ids[0] ?? '')).toMatchObject({ mimeType: 'image/jpeg', ownerId: ME });
  });

  test('More than 10 photos', async () => {
    const response = await upload(Array.from({ length: 11 }, () => ({ data: IMAGE, type: 'image/jpeg' })));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'At most 10 photos are allowed' });
    expect(store.photos.photos.size).toBe(0);
  });

  test('Photo size limit', async () => {
    expect((await upload([{ data: Buffer.alloc(MAX_PHOTO_BYTES), type: 'image/jpeg' }])).status).toBe(201);

    const tooBig = await upload([{ data: Buffer.alloc(MAX_PHOTO_BYTES + 1), type: 'image/jpeg' }]);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body).toEqual({ error: 'Each photo must be at most 5 MB' });
    expect(store.photos.photos.size).toBe(1);
  });

  test('Not an image, or no photo', async () => {
    const notImage = await upload([{ data: IMAGE, type: 'text/plain' }]);
    expect(notImage.status).toBe(400);
    expect(notImage.body).toEqual(BAD_REQUEST);

    const none = await request(app).post('/api/photos').set('Authorization', bearer(ME)).field('note', 'no file');
    expect(none.status).toBe(400);
    expect(store.photos.photos.size).toBe(0);
  });

  test.each([
    ['no boundary', 'multipart/form-data', 'whatever'],
    [
      'an unterminated body',
      'multipart/form-data; boundary=xyz',
      '--xyz\r\nContent-Disposition: form-data; name="photos"; filename="a.png"\r\nContent-Type: image/png\r\n\r\ndata',
    ],
    ['a part without headers', 'multipart/form-data; boundary=xyz', '--xyz\r\nno header end--xyz--'],
  ])('Malformed multipart body: %s', async (_name, contentType, body) => {
    const response = await request(app)
      .post('/api/photos')
      .set('Authorization', bearer(ME))
      .set('Content-Type', contentType)
      .send(Buffer.from(body));

    expect(response.status).toBe(400);
    expect(response.body).toEqual(BAD_REQUEST);
  });

  test('Photo in another field', async () => {
    const response = await request(app)
      .post('/api/photos')
      .set('Authorization', bearer(ME))
      .attach('file', IMAGE, { filename: 'a.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(BAD_REQUEST);
    expect(store.photos.photos.size).toBe(0);
  });

  test('Missing session token', async () => {
    const response = await request(app)
      .post('/api/photos')
      .attach('photos', IMAGE, { filename: 'a.png', contentType: 'image/png' });

    expect(response.status).toBe(401);
    expect(store.photos.photos.size).toBe(0);
  });
});

describe('Unmocked: GET /api/photos/:id', () => {
  test('Stored and unknown photo', async () => {
    const id = await store.photos.save(IMAGE, 'image/png', ME);

    const found = await request(app).get(`/api/photos/${id}`).buffer(true).parse(binaryParser);
    expect(found.status).toBe(200);
    expect(found.headers['content-type']).toBe('image/png');
    expect((found.body as Buffer).equals(IMAGE)).toBe(true);

    const missing = await request(app).get('/api/photos/ffffffffffffffffffffffff');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Photo not found' });
  });
});

function binaryParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void): void {
  const stream = res as unknown as Readable;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
}
