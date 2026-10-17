import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createApp } from '../../src/app';
import { currentUser, requireAuth, SESSION_TTL_SECONDS } from '../../src/sessions';
import { MemorySessionRepo } from '../helpers/memorySessionRepo';

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

interface AuthBody {
  firstName: string;
  lastName: string;
  email: string;
  sessionToken: string;
  sessionExpiresIn: number;
  refreshToken: string;
}

let sessions: MemorySessionRepo;
let app: express.Express;

beforeEach(() => {
  mockVerifyIdToken.mockReset();
  sessions = new MemorySessionRepo();
  app = createApp({ sessions });
});

async function signIn(): Promise<AuthBody> {
  mockVerifyIdToken.mockResolvedValue(ticketFor(VERIFIED_PAYLOAD));
  const response = await request(app).post('/api/auth/google').send({ idToken: 'good-token' });
  expect(response.status).toBe(200);
  return response.body as AuthBody;
}

function refresh(refreshToken: string) {
  return request(app).post('/api/auth/refresh').send({ refreshToken });
}

// Interface POST /api/auth/google
describe('Mocked: POST /api/auth/google', () => {
  // Mocked behavior: Google accepts the token
  // Input: POST request with an idToken
  // Expected status code: 200
  // Expected behavior: token is verified against our client ID; a refresh
  //   token is stored (hashed, never in plain text)
  // Expected output: the account's name and email, a session token for that
  //   account, its lifetime, and a refresh token
  test('Valid token', async () => {
    const body = await signIn();

    expect(Object.keys(body).sort()).toEqual(
      ['email', 'firstName', 'lastName', 'refreshToken', 'sessionExpiresIn', 'sessionToken']
    );
    expect(body).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      sessionExpiresIn: SESSION_TTL_SECONDS,
    });
    expect(typeof body.refreshToken).toBe('string');
    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'good-token',
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    expect(jwt.decode(body.sessionToken)).toMatchObject({ sub: '1234567890', email: 'ada@example.com' });
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0]?.tokenHash).not.toBe(body.refreshToken);
  });

  // Mocked behavior: Google accepts the token but the email is unverified
  // Input: POST request with an idToken
  // Expected status code: 401
  // Expected behavior: sign-in is refused; no session is created
  // Expected output: { error: "Invalid or expired Google ID token" }
  test('Unverified email', async () => {
    mockVerifyIdToken.mockResolvedValue(ticketFor({ ...VERIFIED_PAYLOAD, email_verified: false }));

    const response = await request(app).post('/api/auth/google').send({ idToken: 'good-token' });

    expect(response.status).toBe(401);
    expect(sessions.rows).toHaveLength(0);
  });

  // Mocked behavior: Google rejects the token
  // Input: POST request with an idToken
  // Expected status code: 401
  // Expected behavior: sign-in is refused; no session is created
  // Expected output: { error: "Invalid or expired Google ID token" }
  test('Rejected token', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token used too late'));

    const response = await request(app).post('/api/auth/google').send({ idToken: 'good-token' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired Google ID token' });
    expect(sessions.rows).toHaveLength(0);
  });

  // Mocked behavior: Google accepts the token but the session store fails
  // Input: POST request with an idToken
  // Expected status code: 500
  // Expected behavior: no tokens are handed out
  // Expected output: { error: "Internal Server Error" }
  test('Session store failure', async () => {
    mockVerifyIdToken.mockResolvedValue(ticketFor(VERIFIED_PAYLOAD));
    jest.spyOn(sessions, 'insert').mockRejectedValue(new Error('connection lost'));

    const response = await request(app).post('/api/auth/google').send({ idToken: 'good-token' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
  });
});

// Interface POST /api/auth/refresh
describe('Mocked: POST /api/auth/refresh', () => {
  // Mocked behavior: Google accepted the original sign-in
  // Input: POST request with the refresh token from sign-in
  // Expected status code: 200
  // Expected behavior: Google is not called again; the old refresh token is
  //   used up and a new one is issued
  // Expected output: the account's name and email with a new session token
  //   and a new refresh token
  test('Valid refresh token', async () => {
    const first = await signIn();
    mockVerifyIdToken.mockClear();

    const response = await refresh(first.refreshToken);

    expect(response.status).toBe(200);
    const body = response.body as AuthBody;
    expect(body).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' });
    expect(body.refreshToken).not.toBe(first.refreshToken);
    expect(jwt.decode(body.sessionToken)).toMatchObject({ sub: '1234567890' });
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  // Mocked behavior: Google accepted the original sign-in
  // Input: the first refresh token, presented again after it was exchanged
  // Expected status code: 401
  // Expected behavior: treated as stolen; every token from that sign-in is
  //   revoked, including the one issued by the first exchange
  // Expected output: { error: "Invalid or expired refresh token" }
  test('Reused refresh token', async () => {
    const first = await signIn();
    const second = (await refresh(first.refreshToken)).body as AuthBody;

    const reuse = await refresh(first.refreshToken);

    expect(reuse.status).toBe(401);
    expect(reuse.body).toEqual({ error: 'Invalid or expired refresh token' });
    expect((await refresh(second.refreshToken)).status).toBe(401);
    expect(sessions.rows).toHaveLength(0);
  });

  // Mocked behavior: Google accepted two separate sign-ins
  // Input: a reused refresh token from the first sign-in
  // Expected status code: 401
  // Expected behavior: only the first sign-in is revoked; the second still
  //   refreshes
  // Expected output: 200 for the second sign-in's token
  test('Reuse only revokes its own sign-in', async () => {
    const phone = await signIn();
    const tablet = await signIn();
    await refresh(phone.refreshToken);

    expect((await refresh(phone.refreshToken)).status).toBe(401);
    expect((await refresh(tablet.refreshToken)).status).toBe(200);
  });

  // Mocked behavior: Google accepted the original sign-in
  // Input: a refresh token past its expiry
  // Expected status code: 401
  // Expected behavior: no new tokens are issued
  // Expected output: { error: "Invalid or expired refresh token" }
  test('Expired refresh token', async () => {
    const first = await signIn();
    for (const row of sessions.rows) {
      row.expiresAt = new Date(Date.now() - 1000);
    }

    const response = await refresh(first.refreshToken);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired refresh token' });
  });

  // Mocked behavior: the session store fails
  // Input: POST request with a refresh token
  // Expected status code: 500
  // Expected behavior: no tokens are handed out
  // Expected output: { error: "Internal Server Error" }
  test('Session store failure', async () => {
    jest.spyOn(sessions, 'consume').mockRejectedValue(new Error('connection lost'));

    const response = await refresh('some-refresh-token');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
  });
});

// Interface POST /api/auth/logout
describe('Mocked: POST /api/auth/logout', () => {
  // Mocked behavior: Google accepted the original sign-in
  // Input: POST request with the current refresh token
  // Expected status code: 204
  // Expected behavior: every token from that sign-in is revoked, so the
  //   refresh token no longer works
  // Expected output: empty body
  test('Valid refresh token', async () => {
    const first = await signIn();
    const second = (await refresh(first.refreshToken)).body as AuthBody;

    const response = await request(app).post('/api/auth/logout').send({ refreshToken: second.refreshToken });

    expect(response.status).toBe(204);
    expect((await refresh(second.refreshToken)).status).toBe(401);
    expect(sessions.rows).toHaveLength(0);
  });

  // Mocked behavior: the session store fails
  // Input: POST request with a refresh token
  // Expected status code: 500
  // Expected behavior: the failure is reported, not hidden
  // Expected output: { error: "Internal Server Error" }
  test('Session store failure', async () => {
    jest.spyOn(sessions, 'find').mockRejectedValue(new Error('connection lost'));

    const response = await request(app).post('/api/auth/logout').send({ refreshToken: 'some-refresh-token' });

    expect(response.status).toBe(500);
  });
});

// requireAuth middleware, mounted on a test-only route until the app has
// real data routes to protect.
describe('Mocked: requireAuth', () => {
  const protectedApp = express().get('/protected', requireAuth, (_req, res) => {
    res.json(currentUser(res));
  });

  // Mocked behavior: Google accepted the sign-in
  // Input: GET /protected with the session token from sign-in
  // Expected status code: 200
  // Expected behavior: middleware lets the request through
  // Expected output: the signed-in user's id and email
  test('Session token from sign-in', async () => {
    const { sessionToken } = await signIn();

    const response = await request(protectedApp).get('/protected').set('Authorization', `Bearer ${sessionToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: '1234567890', email: 'ada@example.com' });
  });

  // Mocked behavior: Google accepted the sign-in, then the session was refreshed
  // Input: GET /protected with the session token from the refresh
  // Expected status code: 200
  // Expected behavior: middleware lets the request through
  // Expected output: the signed-in user's id and email
  test('Session token from refresh', async () => {
    const first = await signIn();
    const { sessionToken } = (await refresh(first.refreshToken)).body as AuthBody;

    const response = await request(protectedApp).get('/protected').set('Authorization', `Bearer ${sessionToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: '1234567890', email: 'ada@example.com' });
  });
});
