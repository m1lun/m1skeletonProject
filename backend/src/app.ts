import express, { type Express, type Response } from 'express';

import { errorHandler } from './errors';
import { describe, verifyGoogleIdToken } from './googleAuth';
import { createFieldsRouter } from './routes/fields';
import { createListingsRouter } from './routes/listings';
import { createOptionsRouter } from './routes/options';
import { createRequestsRouter } from './routes/requests';
import { endSession, refreshSession, requireAuth, startSession, type AuthResponse } from './sessions';
import type { SessionRepo, Store } from './store/types';

export interface AppDeps {
  sessions: SessionRepo;
  // Without a store only the health check and the auth routes are served.
  store?: Store;
}

export function createApp({ sessions, store }: AppDeps): Express {
  const app = express();

  // The auth routes have tiny bodies; the limit rejects oversized ones early.
  app.use('/api/auth', express.json({ limit: '4kb' }));

  // Stays off the /api prefix: scripts/run-backend.sh and the Docker health
  // check poll /health directly.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Handlers return void rather than a promise so they can be passed straight
  // to Express.

  // POST /api/auth/google — verifies `{ idToken }` with Google and starts a
  // session. 400 if no token was sent, 401 if Google rejects it.
  app.post('/api/auth/google', (req, res) => {
    const { idToken } = (req.body ?? {}) as { idToken?: unknown };
    if (!isNonEmptyString(idToken)) {
      res.status(400).json({ error: 'Request body must contain an idToken' });
      return;
    }

    verifyGoogleIdToken(idToken).then(
      (user) => {
        sendAuth(res, startSession(sessions, user));
      },
      (cause: unknown) => {
        console.error(`Google sign-in rejected: ${describe(cause)}`);
        res.status(401).json({ error: 'Invalid or expired Google ID token' });
      }
    );
  });

  // POST /api/auth/refresh — trades `{ refreshToken }` for a new session token
  // and refresh token, without calling Google. 401 means sign in again.
  app.post('/api/auth/refresh', (req, res) => {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: unknown };
    if (!isNonEmptyString(refreshToken)) {
      res.status(400).json({ error: 'Request body must contain a refreshToken' });
      return;
    }

    sendAuth(res, refreshSession(sessions, refreshToken));
  });

  // POST /api/auth/logout — revokes `{ refreshToken }` and every token from
  // the same sign-in. 204 even if it was already gone.
  app.post('/api/auth/logout', (req, res) => {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: unknown };
    if (!isNonEmptyString(refreshToken)) {
      res.status(400).json({ error: 'Request body must contain a refreshToken' });
      return;
    }

    endSession(sessions, refreshToken).then(
      () => {
        res.status(204).end();
      },
      (cause: unknown) => {
        sendServerError(res, cause);
      }
    );
  });

  // Posts carry photo URLs and field rows, so they get a larger body limit.
  if (store !== undefined) {
    const posts = [express.json({ limit: '1mb' }), requireAuth];
    app.use('/api/listings', ...posts, createListingsRouter(store));
    app.use('/api/requests', ...posts, createRequestsRouter(store));
    app.use('/api/options', ...posts, createOptionsRouter(store));
    app.use('/api/fields', ...posts, createFieldsRouter(store));
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.use(errorHandler);

  return app;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

// 200 with the tokens, 401 if the refresh token was rejected (null), or 500
// if the session store failed.
function sendAuth(res: Response, pending: Promise<AuthResponse | null>): void {
  pending.then(
    (result) => {
      if (result === null) {
        res.status(401).json({ error: 'Invalid or expired refresh token' });
      } else {
        res.json(result);
      }
    },
    (cause: unknown) => {
      sendServerError(res, cause);
    }
  );
}

function sendServerError(res: Response, cause: unknown): void {
  console.error(`Session store failed: ${describe(cause)}`);
  res.status(500).json({ error: 'Internal Server Error' });
}
