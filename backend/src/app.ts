import express, { type Express, type Request, type Response } from 'express';

import { describe, verifyGoogleIdToken } from './googleAuth';

export function createApp(): Express {
  const app = express();

  // Only the sign-in route has a body; the limit rejects oversized ones early.
  app.use(express.json({ limit: '4kb' }));

  // Stays off the /api prefix: scripts/run-backend.sh and the Docker health
  // check poll /health directly.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/auth/google', handleGoogleSignIn);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return app;
}

// POST /api/auth/google — verifies `{ idToken }` and responds with the account it
// belongs to. 400 if no token was sent, 401 if Google rejects it. Returns void
// rather than a promise so it can be passed straight to Express.
function handleGoogleSignIn(req: Request, res: Response): void {
  const { idToken } = (req.body ?? {}) as { idToken?: unknown };

  if (typeof idToken !== 'string' || idToken.trim() === '') {
    res.status(400).json({ error: 'Request body must contain an idToken' });
    return;
  }

  verifyGoogleIdToken(idToken).then(
    (user) => {
      res.json({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      });
    },
    (cause: unknown) => {
      console.error(`Google sign-in rejected: ${describe(cause)}`);
      res.status(401).json({ error: 'Invalid or expired Google ID token' });
    }
  );
}
