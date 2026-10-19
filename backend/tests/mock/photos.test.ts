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
  test('Storage failure', async () => {
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
  test('Storage failure', async () => {
    jest.spyOn(store.photos, 'open').mockRejectedValue(new Error('GridFS is unreachable'));

    const response = await request(app).get('/api/photos/ffffffffffffffffffffffff');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
  });
});
