import request from 'supertest';

import { createApp } from '../../src/app';
import { MemorySessionRepo } from '../helpers/memorySessionRepo';

const app = createApp({ sessions: new MemorySessionRepo() });

// Interface GET /health
describe('Unmocked: GET /health', () => {
  // Input: GET request to /health
  // Expected status code: 200
  // Expected behavior: service reports healthy status
  // Expected output: { status: "ok" }
  test('Healthy service', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

// Interface GET /does-not-exist
describe('Unmocked: GET /does-not-exist', () => {
  // Input: GET request to an unregistered route
  // Expected status code: 404
  // Expected behavior: request is rejected; no state is changed
  // Expected output: { error: "Not Found" }
  test('Unregistered route', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found' });
  });
});
