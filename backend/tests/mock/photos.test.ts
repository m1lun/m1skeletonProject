import { Readable } from 'node:stream';

import request from 'supertest';

import { createApp } from '../../src/app';
import { createMemoryStore, type MemoryStore } from '../helpers/memoryStore';
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

// Interface POST /api/photos
describe('Mocked: POST /api/photos', () => {
  // Input: one valid JPEG in the "photos" field
  // Expected status code: 500
  // Expected behavior: the error is logged; no photo id is returned
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the photo storage rejects the save with a GridFS error
  test('Storage failure on save', async () => {
    jest.spyOn(store.photos, 'save').mockRejectedValue(new Error('GridFS is unreachable'));

    const response = await request(app)
      .post('/api/photos')
      .set('Authorization', bearer(ME))
      .attach('photos', Buffer.from('fake image'), { filename: 'a.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
  });
});

// Interface GET /api/photos/:id
describe('Mocked: GET /api/photos/:id', () => {
  // Input: GET of a photo id
  // Expected status code: 500
  // Expected behavior: the error is logged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: the photo storage rejects the lookup with a GridFS error
  test('Storage failure on lookup', async () => {
    jest.spyOn(store.photos, 'open').mockRejectedValue(new Error('GridFS is unreachable'));

    const response = await request(app).get('/api/photos/ffffffffffffffffffffffff');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
  });

  // Input: GET of a photo id
  // Expected status code: none; the connection is closed
  // Expected behavior: the server drops the connection, so the app never mistakes a partial image for a
  //   complete one
  // Expected output: no response body
  // Mocked behavior: the photo storage finds the photo, but its stream fails before sending any data
  test('Stream failure before any data is sent', async () => {
    const failing = new Readable({
      read() {
        this.destroy(new Error('GridFS stream failed'));
      },
    });
    jest.spyOn(store.photos, 'open').mockResolvedValue({ mimeType: 'image/png', stream: failing });

    await expect(request(app).get('/api/photos/ffffffffffffffffffffffff')).rejects.toThrow(/socket hang up|aborted|ECONNRESET/);
  });
});
