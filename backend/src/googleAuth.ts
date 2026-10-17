import type { NextFunction, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';

import { env } from './config/env';

export interface GoogleUser {
  // Google account id (`sub`), stable across name and email changes.
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

// Created once so Google's public signing keys are cached between requests.
const tokenVerifier = new OAuth2Client();

// Checks the token's signature against Google's keys, that it was issued to
// our client ID, that Google issued it, and that it has not expired.
// Throws if any of those fail.
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleUser> {
  const ticket = await tokenVerifier.verifyIdToken({
    idToken,
    audience: env.googleClientId,
  });

  const payload = ticket.getPayload();
  if (payload === undefined) {
    throw new Error('Token carried no payload.');
  }

  if (payload.email_verified !== true) {
    throw new Error('Google account has no verified email address.');
  }

  return {
    id: payload.sub,
    firstName: payload.given_name ?? '',
    lastName: payload.family_name ?? '',
    email: payload.email ?? '',
  };
}

// Rejects the request with 401 unless it carries a valid Google ID token in
// `Authorization: Bearer <token>`. Returns void rather than a promise so it can
// be passed straight to Express routes.
export function requireGoogleAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const idToken = readBearerToken(req.get('authorization'));
  if (idToken === undefined) {
    res
      .status(401)
      .json({ error: 'Missing Authorization: Bearer <Google ID token> header' });
    return;
  }

  verifyGoogleIdToken(idToken).then(
    () => {
      next();
    },
    (cause: unknown) => {
      // Logged rather than returned, so callers learn nothing about why a
      // forged token failed.
      console.error(`Rejected ID token: ${describe(cause)}`);
      res.status(401).json({ error: 'Invalid or expired Google ID token' });
    }
  );
}

function readBearerToken(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }

  const [scheme, token] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token === '') {
    return undefined;
  }

  return token;
}

export function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
