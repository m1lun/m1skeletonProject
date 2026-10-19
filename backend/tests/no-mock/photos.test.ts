import type { Readable } from 'node:stream';

import request from 'supertest';

import { createApp } from '../../src/app';
import { MAX_PHOTO_BYTES } from '../../src/models/common';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
import { ME, OTHER, bearer } from '../helpers/postFixtures';

// A few bytes are enough: the server checks the declared type and size, not the picture.
const IMAGE = Buffer.from('fake image bytes');

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ sessions: store.sessions, store });
});

function upload(files: { data: Buffer; type: string }[], userId = ME): request.Test {
  let pending = request(app).post('/api/photos').set('Authorization', bearer(userId));
  for (const [index, file] of files.entries()) {
    pending = pending.attach('photos', file.data, { filename: `photo${index}`, contentType: file.type });
  }
  return pending;
}

// Interface POST /api/photos
describe('Unmocked: POST /api/photos', () => {
  // Input: one JPEG in the "photos" field of a multipart request
  // Expected status code: 201
  // Expected behavior: the photo is stored with its type and the caller as owner
  // Expected output: { ids: [one 24-character id] }
  test('One photo', async () => {
    const response = await upload([{ data: IMAGE, type: 'image/jpeg' }]);

    expect(response.status).toBe(201);
    const { ids } = response.body as { ids: string[] };
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^[0-9a-f]{24}$/);
    expect(store.photos.photos.get(ids[0] ?? '')).toMatchObject({ mimeType: 'image/jpeg', ownerId: ME });
    expect(store.photos.photos.get(ids[0] ?? '')?.data.equals(IMAGE)).toBe(true);
  });

  // Input: three photos (png, webp, gif) in one request
  // Expected status code: 201
  // Expected behavior: all three are stored
  // Expected output: { ids: [three different ids, in the order sent] }
  test('Several photos of different types', async () => {
    const response = await upload([
      { data: IMAGE, type: 'image/png' },
      { data: IMAGE, type: 'image/webp' },
      { data: IMAGE, type: 'image/gif' },
    ]);

    expect(response.status).toBe(201);
    const { ids } = response.body as { ids: string[] };
    expect(new Set(ids).size).toBe(3);
    expect(ids.map((id) => store.photos.photos.get(id)?.mimeType)).toEqual(['image/png', 'image/webp', 'image/gif']);
  });

  // Input: exactly 10 photos (the maximum)
  // Expected status code: 201
  // Expected behavior: all ten are stored
  // Expected output: { ids: [ten ids] }
  test('Ten photos', async () => {
    const response = await upload(Array.from({ length: 10 }, () => ({ data: IMAGE, type: 'image/jpeg' })));

    expect(response.status).toBe(201);
    expect((response.body as { ids: string[] }).ids).toHaveLength(10);
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

  // Input: a photo of exactly 5 MB, and a photo one byte over
  // Expected status code: 201 for the first, 413 for the second
  // Expected behavior: the first is stored; the second is rejected and not stored
  // Expected output: { ids: [id] }, then { error: "Each photo must be at most 5 MB" }
  test('Photo size limit', async () => {
    const atLimit = await upload([{ data: Buffer.alloc(MAX_PHOTO_BYTES), type: 'image/jpeg' }]);
    expect(atLimit.status).toBe(201);

    const tooBig = await upload([{ data: Buffer.alloc(MAX_PHOTO_BYTES + 1), type: 'image/jpeg' }]);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body).toEqual({ error: 'Each photo must be at most 5 MB' });
    expect(store.photos.photos.size).toBe(1);
  });

  // Input: a file whose type is not an image (text/plain), and one that is an unsupported image type (image/bmp)
  // Expected status code: 400
  // Expected behavior: request is rejected; nothing is stored
  // Expected output: { error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' }
  test.each(['text/plain', 'image/bmp', 'application/pdf'])('Unsupported type %s', async (type) => {
    const response = await upload([{ data: IMAGE, type }]);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' });
    expect(store.photos.photos.size).toBe(0);
  });

  // Input: one valid photo and one non-image in the same request
  // Expected status code: 400
  // Expected behavior: the whole request is rejected; the valid photo is not stored either
  // Expected output: { error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' }
  test('One bad file rejects the whole upload', async () => {
    const response = await upload([
      { data: IMAGE, type: 'image/png' },
      { data: IMAGE, type: 'text/plain' },
    ]);

    expect(response.status).toBe(400);
    expect(store.photos.photos.size).toBe(0);
  });

  // Input: an empty file declared as image/png
  // Expected status code: 400
  // Expected behavior: request is rejected; nothing is stored
  // Expected output: { error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' }
  test('Empty file', async () => {
    const response = await upload([{ data: Buffer.alloc(0), type: 'image/png' }]);

    expect(response.status).toBe(400);
    expect(store.photos.photos.size).toBe(0);
  });

  // Input: a multipart request with a text field but no file in the "photos" field
  // Expected status code: 400
  // Expected behavior: request is rejected; nothing is stored
  // Expected output: { error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' }
  test('No photos attached', async () => {
    const response = await request(app)
      .post('/api/photos')
      .set('Authorization', bearer(ME))
      .field('note', 'no file here');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' });
  });

  // Input: a file sent in a field other than "photos"
  // Expected status code: 400
  // Expected behavior: request is rejected; nothing is stored
  // Expected output: { error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' }
  test('Wrong field name', async () => {
    const response = await request(app)
      .post('/api/photos')
      .set('Authorization', bearer(ME))
      .attach('picture', IMAGE, { filename: 'a.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
    expect(store.photos.photos.size).toBe(0);
  });

  // Input: a JSON body instead of multipart/form-data
  // Expected status code: 400
  // Expected behavior: request is rejected; nothing is stored
  // Expected output: { error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' }
  test('Not a multipart request', async () => {
    const response = await request(app).post('/api/photos').set('Authorization', bearer(ME)).send({ photos: 'x' });

    expect(response.status).toBe(400);
    expect(store.photos.photos.size).toBe(0);
  });

  // Input: a multipart request whose Content-Type has no boundary, one whose body is never closed,
  //   and one whose part has no header section
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
    expect(response.body).toEqual({ error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' });
    expect(store.photos.photos.size).toBe(0);
  });

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected before the body is read; nothing is stored
  // Expected output: { error: "Missing Authorization: Bearer <session token> header" }
  test('Missing session token', async () => {
    const response = await request(app)
      .post('/api/photos')
      .attach('photos', IMAGE, { filename: 'a.png', contentType: 'image/png' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing Authorization: Bearer <session token> header' });
    expect(store.photos.photos.size).toBe(0);
  });
});

// Interface GET /api/photos/:id
describe('Unmocked: GET /api/photos/:id', () => {
  // Input: GET of a stored photo, with no session token (photos are public so the image loader can fetch them)
  // Expected status code: 200
  // Expected behavior: database unchanged
  // Expected output: the photo's bytes, with its Content-Type and a long-lived Cache-Control header
  test('Stored photo', async () => {
    const id = await store.photos.save(IMAGE, 'image/png', OTHER);

    const response = await request(app).get(`/api/photos/${id}`).buffer(true).parse(binaryParser);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((response.body as Buffer).equals(IMAGE)).toBe(true);
  });

  // Input: GET of an id that does not exist
  // Expected status code: 404
  // Expected behavior: database unchanged
  // Expected output: { error: "Photo not found" }
  test('Unknown id', async () => {
    const response = await request(app).get('/api/photos/ffffffffffffffffffffffff');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Photo not found' });
  });

  // Input: GET of an id that is not a valid photo id
  // Expected status code: 404
  // Expected behavior: database unchanged
  // Expected output: { error: "Photo not found" }
  test('Malformed id', async () => {
    const response = await request(app).get('/api/photos/not-an-id');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Photo not found' });
  });

  // Input: upload a photo with POST /api/photos, then GET it by the returned id
  // Expected status code: 201 then 200
  // Expected behavior: the same bytes come back
  // Expected output: the uploaded bytes
  test('Round trip', async () => {
    const uploaded = await upload([{ data: IMAGE, type: 'image/webp' }]);
    const [id] = (uploaded.body as { ids: string[] }).ids;

    const response = await request(app).get(`/api/photos/${id ?? ''}`).buffer(true).parse(binaryParser);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/webp');
    expect((response.body as Buffer).equals(IMAGE)).toBe(true);
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
