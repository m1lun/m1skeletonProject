import express from 'express';
import request from 'supertest';

import { createApp } from '../../src/app';
import { requireGoogleAuth } from '../../src/googleAuth';

const mockVerifyIdToken = jest.fn();

// Hoisted above the imports by ts-jest. googleAuth.ts creates its OAuth2Client
// while being imported, before mockVerifyIdToken is initialized, so the mock
// looks it up only when a test calls verifyIdToken.
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: (...args: unknown[]): unknown => mockVerifyIdToken(...args),
  })),
}));

function ticketFor(payload: Record<string, unknown>) {
  return { getPayload: () => payload };
}

const VERIFIED_PAYLOAD = {
  sub: '1234567890',
  given_name: 'Ada',
  family_name: 'Lovelace',
  email: 'ada@example.com',
  email_verified: true,
};

beforeEach(() => {
  mockVerifyIdToken.mockReset();
});

// Interface POST /api/auth/google
describe('Mocked: POST /api/auth/google', () => {
  // Mocked behavior: Google accepts the token
  // Input: POST request with an idToken
  // Expected status code: 200
  // Expected behavior: token is verified against our client ID
  // Expected output: the verified account's name and email
  test('Valid token', async () => {
    mockVerifyIdToken.mockResolvedValue(ticketFor(VERIFIED_PAYLOAD));

    const response = await request(createApp())
      .post('/api/auth/google')
      .send({ idToken: 'good-token' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    });
    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'good-token',
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  });

  // Mocked behavior: Google accepts the token but the email is unverified
  // Input: POST request with an idToken
  // Expected status code: 401
  // Expected behavior: sign-in is refused
  // Expected output: { error: "Invalid or expired Google ID token" }
  test('Unverified email', async () => {
    mockVerifyIdToken.mockResolvedValue(
      ticketFor({ ...VERIFIED_PAYLOAD, email_verified: false })
    );

    const response = await request(createApp())
      .post('/api/auth/google')
      .send({ idToken: 'good-token' });

    expect(response.status).toBe(401);
  });
});

// requireGoogleAuth middleware, mounted on a test-only route until the app
// has real data routes to protect.
describe('Mocked: requireGoogleAuth', () => {
  const protectedApp = express().get('/protected', requireGoogleAuth, (_req, res) => {
    res.json({ ok: true });
  });

  // Mocked behavior: Google accepts the token
  // Input: GET /protected with a bearer token
  // Expected status code: 200
  // Expected behavior: middleware lets the request through
  // Expected output: the route's response
  test('Valid bearer token', async () => {
    mockVerifyIdToken.mockResolvedValue(ticketFor(VERIFIED_PAYLOAD));

    const response = await request(protectedApp)
      .get('/protected')
      .set('Authorization', 'Bearer good-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
