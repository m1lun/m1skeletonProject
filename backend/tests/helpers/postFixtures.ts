import jwt from 'jsonwebtoken';

import type { BuyerRequest } from '../../src/models/request';

const JWT_SECRET = process.env.JWT_SECRET ?? '';

export const ME = 'user-me';
export const OTHER = 'user-other';

// A photo id as returned by POST /api/photos.
export const PHOTO_ID = '6ad40b88e74dd3678bfef8f3';

// The Authorization header for a session token of userId, as /api/auth/google would issue it.
export function bearer(userId: string): string {
  const token = jwt.sign({ email: `${userId}@example.com` }, JWT_SECRET, {
    subject: userId,
    issuer: 'matchmarket-backend',
    audience: 'matchmarket-app',
    expiresIn: 60,
  });
  return `Bearer ${token}`;
}

export const LOCATION = { longitude: -123.25, latitude: 49.26 };

// A request body POST /api/listings accepts; pass overrides for what a test changes.
export function listingBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category: 'Furniture',
    price: 40,
    condition: 'good',
    description: 'A sturdy desk',
    address: '6335 Thunderbird Cres',
    location: LOCATION,
    photoIds: [PHOTO_ID],
    listingFields: [
      { kind: 'builtin', key: 'brand', value: 'IKEA' },
      { kind: 'builtin', key: 'dimensions', value: { width: 120, height: 75, depth: 60 } },
    ],
    ...overrides,
  };
}

// A request body POST /api/requests accepts; only the category, address, location and a max price are required.
export function requestBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category: 'Furniture',
    description: 'Looking for a desk',
    address: '6335 Thunderbird Cres',
    location: LOCATION,
    photoIds: [],
    requestFields: [
      { kind: 'builtin', key: 'price', value: 100, hard: true },
      { kind: 'builtin', key: 'condition', value: 'good', hard: false, importance: 4 },
      { kind: 'builtin', key: 'colour', value: 'Black', hard: false, importance: 2 },
    ],
    ...overrides,
  };
}

// A body that holds only an error list, as the API returns for a 400.
export interface ErrorBody {
  error: string;
  details?: string[];
}

// A valid open request for tests; pass overrides for the fields a test cares about.
export function newRequest(ownerId: string, overrides: Partial<Omit<BuyerRequest, 'id'>> = {}): Omit<BuyerRequest, 'id'> {
  const now = new Date();
  return {
    ownerId,
    category: 'furniture',
    description: 'Looking for a desk',
    address: '6335 Thunderbird Cres',
    location: { type: 'Point', coordinates: [-123.25, 49.26] },
    photoIds: [],
    requestFields: [{ key: 'price', label: 'Max price', kind: 'builtin', type: 'number', value: 100, hard: true }],
    status: 'open',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
