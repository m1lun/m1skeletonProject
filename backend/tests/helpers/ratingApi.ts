import request from 'supertest';

import { ME, bearer } from './dealFixtures';

export type Method = 'POST' | 'PUT';

interface CallOptions {
  userId?: string;
  auth?: string | null;
  type?: string;
}

type App = Parameters<typeof request>[0];

export function call(app: App, method: Method, dealId: string, raw: string, options: CallOptions = {}): request.Test {
  const url = `/api/deals/${dealId}/ratings`;
  const sent = method === 'POST' ? request(app).post(url) : request(app).put(url);
  const auth = options.auth === undefined ? bearer(options.userId ?? ME) : options.auth;
  const withAuth = auth === null ? sent : sent.set('Authorization', auth);
  return withAuth.set('Content-Type', options.type ?? 'application/json').send(raw);
}

export function rate(app: App, method: Method, dealId: string, body: object, options: CallOptions = {}): request.Test {
  return call(app, method, dealId, JSON.stringify(body), options);
}
