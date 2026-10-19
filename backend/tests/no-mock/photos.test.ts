import type { Readable } from 'node:stream';

import request from 'supertest';

import { createApp } from '../../src/app';
import { MAX_PHOTO_BYTES } from '../../src/models/common';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { ME, bearer } from '../helpers/postFixtures';

// A few bytes are enough: the server checks the declared type and size, not the picture.
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

// Interface POST /api/photos
describe('Unmocked: POST /api/photos', () => {
  // Input: two images (jpeg and png) in the "photos" field of a multipart request
  // Expected status code: 201
  // Expected behavior: both are stored with their type and the caller as owner
  // Expected output: { ids: [two different 24-character ids] }
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

  // Input: 11 photos
  // Expected status code: 400
  // Expected behavior: request is rejected; nothing is stored
  // Expected output: { error: "At most 10 photos are allowed" }
  test('More than 10 photos', async () => {
    const response = await upload(Array.from({ length: 11 }, () => ({ data: IMAGE, type: 'image/jpeg' })));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'At most 10 photos are allowed' });
    expect(store.photos.photos.size).toBe(0);
  });

  // Input: a photo of exactly 5 MB, then one a byte over
  // Expected status code: 201, then 413
  // Expected behavior: the first is stored; the second is rejected and not stored
  // Expected output: { ids: [id] }, then { error: "Each photo must be at most 5 MB" }
  test('Photo size limit', async () => {
    expect((await upload([{ data: Buffer.alloc(MAX_PHOTO_BYTES), type: 'image/jpeg' }])).status).toBe(201);

    const tooBig = await upload([{ data: Buffer.alloc(MAX_PHOTO_BYTES + 1), type: 'image/jpeg' }]);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body).toEqual({ error: 'Each photo must be at most 5 MB' });
    expect(store.photos.photos.size).toBe(1);
  });

  // Input: a file that is not a supported image (text/plain), and a request with no file in "photos"
  // Expected status code: 400
  // Expected behavior: request is rejected; nothing is stored
  // Expected output: { error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' }
  test('Not an image, or no photo', async () => {
    const notImage = await upload([{ data: IMAGE, type: 'text/plain' }]);
    expect(notImage.status).toBe(400);
    expect(notImage.body).toEqual(BAD_REQUEST);

    const none = await request(app).post('/api/photos').set('Authorization', bearer(ME)).field('note', 'no file');
    expect(none.status).toBe(400);
    expect(store.photos.photos.size).toBe(0);
  });

  // Input: a multipart request with no boundary, one whose body is never closed, and one whose part has no headers
  // Expected status code: 400
  // Expected behavior: the body cannot be parsed, so the request is rejected; nothing is stored
  // Expected output: { error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' }
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

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected; nothing is stored
  // Expected output: { error: "Missing Authorization: Bearer <session token> header" }
  test('Missing session token', async () => {
    const response = await request(app)
      .post('/api/photos')
      .attach('photos', IMAGE, { filename: 'a.png', contentType: 'image/png' });

    expect(response.status).toBe(401);
    expect(store.photos.photos.size).toBe(0);
  });
});

// Interface GET /api/photos/:id
describe('Unmocked: GET /api/photos/:id', () => {
  // Input: GET of a stored photo with no session token (photos are public), then of an unknown id
  // Expected status code: 200, then 404
  // Expected behavior: database unchanged
  // Expected output: the photo's bytes with its Content-Type, then { error: "Photo not found" }
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

// Collects a binary response body into a Buffer, which supertest does not do for image types.
function binaryParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void): void {
  const stream = res as unknown as Readable;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
}
