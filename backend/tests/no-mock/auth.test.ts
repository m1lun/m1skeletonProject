import express from 'express';
import request from 'supertest';

import { createApp } from '../../src/app';
import { requireGoogleAuth } from '../../src/googleAuth';

// Interface POST /api/auth/google
describe('Unmocked: POST /api/auth/google', () => {
  // Input: POST request with no idToken in the body
  // Expected status code: 400
  // Expected behavior: request is rejected before contacting Google
  // Expected output: { error: "Request body must contain an idToken" }
  test('Missing idToken', async () => {
    const response = await request(createApp()).post('/api/auth/google').send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Request body must contain an idToken' });
  });

  // Input: POST request with a malformed idToken
  // Expected status code: 401
  // Expected behavior: token fails verification; no user is returned
  // Expected output: { error: "Invalid or expired Google ID token" }
  test('Malformed idToken', async () => {
    const response = await request(createApp())
      .post('/api/auth/google')
      .send({ idToken: 'not-a-real-token' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired Google ID token' });
  });
});

// requireGoogleAuth middleware, mounted on a test-only route until the app
// has real data routes to protect.
describe('Unmocked: requireGoogleAuth', () => {
  const protectedApp = express().get('/protected', requireGoogleAuth, (_req, res) => {
    res.json({ ok: true });
  });

  // Input: GET request with no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected before reaching the route
  // Expected output: error message naming the missing header
  test('Without a token', async () => {
    const response = await request(protectedApp).get('/protected');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Missing Authorization: Bearer <Google ID token> header',
    });
  });

  // Input: GET request with an invalid bearer token
  // Expected status code: 401
  // Expected behavior: token fails verification; the route is not reached
  // Expected output: { error: "Invalid or expired Google ID token" }
  test('With an invalid token', async () => {
    const response = await request(protectedApp)
      .get('/protected')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired Google ID token' });
  });
});
