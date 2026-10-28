import { Router } from 'express';

import { BadRequestError } from '../errors';
import { DEFAULT_DEALS_PAGE, MAX_DEALS_PAGE } from '../models/common';
import type { Deal } from '../models/deal';
import type { Rating } from '../models/rating';
import { averageScore } from '../reputation/score';
import { currentUser } from '../sessions';
import type { Store } from '../store/types';
import { handle } from './handle';

const DEAL_ID = /^[0-9a-f]{24}$/;
const DEALS_PARAMS = ['limit', 'before'];

function parseLimit(value: unknown, errors: string[]): number {
  if (value === undefined) {
    return DEFAULT_DEALS_PAGE;
  }
  const limit = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : 0;
  if (limit < 1 || limit > MAX_DEALS_PAGE) {
    errors.push(`limit must be a whole number from 1 to ${MAX_DEALS_PAGE}`);
  }
  return limit;
}

function parseBefore(value: unknown, errors: string[]): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !DEAL_ID.test(value)) {
    errors.push('before must be the nextCursor from a previous page');
    return undefined;
  }
  return value;
}

function present(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

function ratingView(rating: Rating | undefined): { stars: number; comment: string; createdAt: Date } | null {
  return rating === undefined ? null : { stars: rating.stars, comment: rating.comment, createdAt: rating.createdAt };
}

export function createDealsRouter(store: Store): Router {
  const router = Router();

  // GET /api/deals?limit=20&before=<nextCursor> — the caller's deals, newest first.
  // At most 5 queries however many deals there are; nextCursor is null on the last page.
  router.get('/', handle(async (req, res) => {
    const errors = Object.keys(req.query)
      .filter((name) => !DEALS_PARAMS.includes(name))
      .map((name) => `unsupported parameter "${name}"`);
    const limit = parseLimit(req.query.limit, errors);
    const before = parseBefore(req.query.before, errors);
    if (errors.length > 0) {
      throw new BadRequestError(errors);
    }

    const me = currentUser(res).id;
    const otherParty = (deal: Deal): string => (deal.sellerId === me ? deal.buyerId : deal.sellerId);

    // One extra deal tells whether another page follows.
    const found = await store.deals.listByUser(me, limit + 1, before);
    const page = found.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = found.length > limit && last !== undefined ? last.id : null;

    const [ratings, reputations, listings, requests] = await Promise.all([
      store.ratings.listByDeals(page.map((deal) => deal.id)),
      store.reputations.findMany(present(page.map(otherParty))),
      store.listings.findByIds(present(page.map((deal) => deal.listingId)), ['category', 'price', 'photoIds'], true),
      store.requests.findByIds(present(page.map((deal) => deal.requestId)), ['category', 'photoIds'], true),
    ]);

    const ratingBy = new Map(ratings.map((rating) => [`${rating.dealId}:${rating.raterId}`, rating]));
    const reputationOf = new Map(reputations.map((reputation) => [reputation.userId, reputation]));
    const listingOf = new Map(listings.map((listing) => [listing.id, listing]));
    const requestOf = new Map(requests.map((request) => [request.id, request]));

    const deals = page.map((deal) => {
      const other = otherParty(deal);
      const listing = deal.listingId === null ? undefined : listingOf.get(deal.listingId);
      const request = deal.requestId === null ? undefined : requestOf.get(deal.requestId);
      const reputation = reputationOf.get(other);
      return {
        id: deal.id,
        role: deal.sellerId === me ? 'seller' : 'buyer',
        agreedPrice: deal.agreedPrice,
        createdAt: deal.createdAt,
        title: listing?.category ?? request?.category ?? '',
        listing:
          listing === undefined
            ? null
            : { id: deal.listingId, category: listing.category, price: listing.price, photoId: listing.photoIds?.[0] ?? null },
        request:
          request === undefined
            ? null
            : { id: deal.requestId, category: request.category, photoId: request.photoIds?.[0] ?? null },
        otherUser: {
          id: other,
          score: reputation === undefined ? null : averageScore(reputation.starSum, reputation.ratingCount),
          ratingCount: reputation?.ratingCount ?? 0,
        },
        myRating: ratingView(ratingBy.get(`${deal.id}:${me}`)),
        theirRating: ratingView(ratingBy.get(`${deal.id}:${other}`)),
      };
    });
    res.json({ deals, nextCursor });
  }));

  return router;
}
