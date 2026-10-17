import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createApp } from '../../src/app';
import { requireAuth } from '../../src/sessions';
import { MemorySessionRepo } from '../helpers/memorySessionRepo';

// These requests are all rejected before the session store is touched.
const app = createApp({ sessions: new MemorySessionRepo() });
const JWT_SECRET = process.env.JWT_SECRET ?? '';

// Interface POST /api/auth/google
describe('Unmocked: POST /api/auth/google', () => {
  // Input: POST request with no idToken in the body
  // Expected status code: 400
  // Expected behavior: request is rejected before contacting Google
  // Expected output: { error: "Request body must contain an idToken" }
  test('Missing idToken', async () => {
    const response = await request(app).post('/api/auth/google').send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Request body must contain an idToken' });
  });

  // Input: POST request with a malformed idToken
  // Expected status code: 401
  // Expected behavior: token fails verification; no session is started
  // Expected output: { error: "Invalid or expired Google ID token" }
  test('Malformed idToken', async () => {
    const response = await request(app).post('/api/auth/google').send({ idToken: 'not-a-real-token' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired Google ID token' });
  });
});

// Interface POST /api/auth/refresh
describe('Unmocked: POST /api/auth/refresh', () => {
  // Input: POST request with no refreshToken in the body
  // Expected status code: 400
  // Expected behavior: request is rejected; no tokens are issued
  // Expected output: { error: "Request body must contain a refreshToken" }
  test('Missing refreshToken', async () => {
    const response = await request(app).post('/api/auth/refresh').send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Request body must contain a refreshToken' });
  });

  // Input: POST request with a refresh token this server never issued
  // Expected status code: 401
  // Expected behavior: no tokens are issued
  // Expected output: { error: "Invalid or expired refresh token" }
  test('Unknown refreshToken', async () => {
    const response = await request(app).post('/api/auth/refresh').send({ refreshToken: 'made-up-token' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired refresh token' });
  });
});

// Interface POST /api/auth/logout
describe('Unmocked: POST /api/auth/logout', () => {
  // Input: POST request with no refreshToken in the body
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Request body must contain a refreshToken" }
  test('Missing refreshToken', async () => {
    const response = await request(app).post('/api/auth/logout').send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Request body must contain a refreshToken' });
  });

  // Input: POST request with a refresh token that is already gone
  // Expected status code: 204
  // Expected behavior: signing out twice is not an error
  // Expected output: empty body
  test('Unknown refreshToken', async () => {
    const response = await request(app).post('/api/auth/logout').send({ refreshToken: 'made-up-token' });

    expect(response.status).toBe(204);
  });
});

// requireAuth middleware, mounted on a test-only route until the app has
// real data routes to protect.
describe('Unmocked: requireAuth', () => {
  const protectedApp = express().get('/protected', requireAuth, (_req, res) => {
    res.json({ ok: true });
  });

  function getWithToken(token: string) {
    return request(protectedApp).get('/protected').set('Authorization', `Bearer ${token}`);
  }

  const claims = { email: 'ada@example.com' };
  const valid = { subject: '1234567890', issuer: 'matchmarket-backend', audience: 'matchmarket-app' };

  // Input: GET request with no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected before reaching the route
  // Expected output: error message naming the missing header
  test('Missing header', async () => {
    const response = await request(protectedApp).get('/protected');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing Authorization: Bearer <session token> header' });
  });

  // Input: GET request with a non-bearer Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected before reaching the route
  // Expected output: error message naming the missing header
  test('Wrong scheme', async () => {
    const response = await request(protectedApp).get('/protected').set('Authorization', 'Basic abc123');

    expect(response.status).toBe(401);
  });

  // Input: GET request with a bearer token that is not a JWT
  // Expected status code: 401
  // Expected behavior: token fails verification; route is not reached
  // Expected output: { error: "Invalid or expired session token" }
  test('Malformed token', async () => {
    const response = await getWithToken('not-a-real-token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired session token' });
  });

  // Input: GET request with a session token that has expired
  // Expected status code: 401
  // Expected behavior: route is not reached; the app should refresh
  // Expected output: { error: "Invalid or expired session token" }
  test('Expired token', async () => {
    const expired = jwt.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 }, JWT_SECRET, valid);

    const response = await getWithToken(expired);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired session token' });
  });

  // Input: GET request with a token signed with a different secret
  // Expected status code: 401
  // Expected behavior: forged token is rejected
  // Expected output: { error: "Invalid or expired session token" }
  test('Forged signature', async () => {
    const forged = jwt.sign(claims, 'some-other-secret-that-is-at-least-32-chars', { ...valid, expiresIn: 60 });

    expect((await getWithToken(forged)).status).toBe(401);
  });

  // Input: GET request with an unsigned ("alg": "none") token
  // Expected status code: 401
  // Expected behavior: unsigned token is rejected
  // Expected output: { error: "Invalid or expired session token" }
  test('Unsigned token', async () => {
    const unsigned = jwt.sign(claims, '', { ...valid, algorithm: 'none', expiresIn: 60 });

    expect((await getWithToken(unsigned)).status).toBe(401);
  });

  // Input: GET request with a token issued for a different audience
  // Expected status code: 401
  // Expected behavior: a token meant for another service is rejected
  // Expected output: { error: "Invalid or expired session token" }
  test('Wrong audience', async () => {
    const other = jwt.sign(claims, JWT_SECRET, { ...valid, audience: 'some-other-app', expiresIn: 60 });

    expect((await getWithToken(other)).status).toBe(401);
  });
});
