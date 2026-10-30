import jwt from 'jsonwebtoken';

import type { Deal } from '../../src/models/deal';
import type { Listing } from '../../src/models/listing';
import type { Rating } from '../../src/models/rating';
import type { BuyerRequest } from '../../src/models/request';
import type { Store } from '../../src/store/types';

export const ME = 'user-me';
export const OTHER = 'user-other';
export const STRANGER = 'user-stranger';

export function bearer(userId: string): string {
  const token = jwt.sign({ email: `${userId}@example.com` }, process.env.JWT_SECRET ?? '', {
    subject: userId,
    issuer: 'matchmarket-backend',
    audience: 'matchmarket-app',
    expiresIn: 60,
  });
  return `Bearer ${token}`;
}

export const PHOTO_ID = '6ad40b88e74dd3678bfef8f3';

const LOCATION: Listing['location'] = { type: 'Point', coordinates: [-123.25, 49.26] };

export function makeListing(store: Store, ownerId: string, overrides: Partial<Listing> = {}): Promise<Listing> {
  const now = new Date();
  return store.listings.insert({
    ownerId,
    category: 'chair',
    price: 40,
    condition: 'good',
    description: 'A sturdy chair',
    address: '6335 Thunderbird Crescent, Vancouver',
    location: LOCATION,
    photoIds: [PHOTO_ID],
    listingFields: [],
    status: 'open',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

export function makeRequest(store: Store, ownerId: string, overrides: Partial<BuyerRequest> = {}): Promise<BuyerRequest> {
  const now = new Date();
  return store.requests.insert({
    ownerId,
    category: 'chair',
    description: 'Looking for a chair',
    address: '6335 Thunderbird Crescent, Vancouver',
    location: LOCATION,
    photoIds: [],
    requestFields: [{ key: 'price', label: 'Price', kind: 'builtin', type: 'number', value: 50, hard: true }],
    status: 'open',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

export function makeDeal(
  store: Store,
  parties: { sellerId: string; buyerId: string },
  posts: { listingId?: string; requestId?: string },
  overrides: Partial<Deal> = {}
): Promise<Deal> {
  return store.deals.insert({
    listingId: posts.listingId ?? null,
    requestId: posts.requestId ?? null,
    sellerId: parties.sellerId,
    buyerId: parties.buyerId,
    agreedPrice: 40,
    createdAt: new Date(),
    ...overrides,
  });
}

export function makeRating(
  store: Store,
  rating: Pick<Rating, 'dealId' | 'raterId' | 'ratedUserId' | 'stars'> & Partial<Rating>
): Promise<Rating> {
  return store.ratings.insert({ comment: '', createdAt: new Date(), ...rating });
}

export function makeReputation(store: Store, userId: string, stars: number[]): Promise<void> {
  return stars.reduce(
    (done, count) => done.then(() => store.reputations.addRating(userId, count, new Date()).then(() => undefined)),
    Promise.resolve()
  );
}
