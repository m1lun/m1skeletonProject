import { Router } from 'express';

import { currentUser } from '../sessions';
import { BadRequestError } from '../errors';
import type { Listing } from '../models/listing';
import type { PostCollection } from '../store/types';
import { handle } from './handle';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

// A post id is a MongoDB ObjectId: 24 hex characters.
const POST_ID = /^[0-9a-f]{24}$/;

function parseLimit(value: unknown, errors: string[]): number {
  if (value === undefined) {
    return DEFAULT_PAGE_SIZE;
  }
  const limit = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : 0;
  if (limit < 1 || limit > MAX_PAGE_SIZE) {
    errors.push(`limit must be a whole number from 1 to ${MAX_PAGE_SIZE}`);
  }
  return limit;
}

function parseBefore(value: unknown, errors: string[]): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !POST_ID.test(value)) {
    errors.push('before must be the nextCursor from a previous page');
    return undefined;
  }
  return value;
}

export function createFeedRouter(listings: PostCollection<Listing>): Router {
  const router = Router();

  // GET /api/feed/listings?limit=20&before=<id> — open listings from other users, newest
  // first. nextCursor is the `before` for the next page, or null on the last page.
  router.get('/listings', handle(async (req, res) => {
    const errors: string[] = [];
    const limit = parseLimit(req.query.limit, errors);
    const before = parseBefore(req.query.before, errors);
    if (errors.length > 0) {
      throw new BadRequestError(errors);
    }
    // One extra listing tells whether another page follows.
    const found = await listings.listOpen(currentUser(res).id, limit + 1, before);
    const page = found.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = found.length > limit && last !== undefined ? last.id : null;
    res.json({ listings: page, nextCursor });
  }));

  return router;
}
