import { Router } from 'express';

import { currentUser } from '../sessions';
import { BadRequestError } from '../errors';
import { DEFAULT_WEIGHTS, asPair, isRequest, rank, type Post } from '../matching/rank';
import { satisfies } from '../matching/satisfies';
import { DEFAULT_TRAVEL_MODE, travelTimes } from '../matching/travelTime';
import type { Store } from '../store/types';
import { handle } from './handle';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

// A post id is a MongoDB ObjectId: 24 hex characters.
const POST_ID = /^[0-9a-f]{24}$/;

// The query parameters GET /api/feed accepts. Any other is rejected rather than
// silently ignored, so a misspelt parameter is noticed.
const MATCH_FEED_PARAMS = ['postId', 'limit', 'cursor'];

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

function parsePostId(value: unknown, errors: string[]): string {
  if (typeof value !== 'string' || !POST_ID.test(value)) {
    errors.push('postId must be the id of one of your requests or listings');
    return '';
  }
  return value;
}

// The cursor is how many matches earlier pages returned. Clients treat it as opaque,
// so it can change form later without breaking them.
function parseCursor(value: unknown, errors: string[]): number {
  if (value === undefined) {
    return 0;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    errors.push('cursor must be the nextCursor from a previous page');
    return 0;
  }
  return Number(value);
}

async function findPost(store: Store, id: string): Promise<Post | null> {
  return (await store.requests.findById(id)) ?? (await store.listings.findById(id));
}

export function createFeedRouter(store: Store): Router {
  const router = Router();

  // GET /api/feed?postId=<id>&limit=20&cursor=<nextCursor> — the ranked feed for one of
  // the caller's open posts: listings that match a request, or requests that match a
  // listing, best first. The first page carries travel times. nextCursor is the
  // `cursor` for the next page, or null on the last page.
  router.get('/', handle(async (req, res) => {
    const errors = Object.keys(req.query)
      .filter((name) => !MATCH_FEED_PARAMS.includes(name))
      .map((name) => `unsupported parameter "${name}"`);
    const postId = parsePostId(req.query.postId, errors);
    const limit = parseLimit(req.query.limit, errors);
    const offset = parseCursor(req.query.cursor, errors);
    if (errors.length > 0) {
      throw new BadRequestError(errors);
    }

    const me = currentUser(res).id;
    const source = await findPost(store, postId);
    if (source === null) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    if (source.ownerId !== me) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (source.status === 'closed') {
      res.status(409).json({ error: 'Closed posts have no feed' });
      return;
    }

    const candidates: Post[] = isRequest(source)
      ? await store.listings.listOpenInCategory(source.category, me)
      : await store.requests.listOpenInCategory(source.category, me);
    const matching = candidates.filter((candidate) => {
      const { request, listing } = asPair(source, candidate);
      return satisfies(request, listing);
    });
    // Every match is ranked before paging, since any of them could come first.
    const ranked = rank(source, matching, DEFAULT_WEIGHTS);
    const end = offset + limit;
    const page = ranked.slice(offset, end);
    // Only the first page asks for travel times, to stay within the routing service's
    // daily cap. If it fails, the feed is still returned, without them.
    const minutes =
      offset === 0
        ? await travelTimes(source.location, page.map((match) => match.post.location), DEFAULT_TRAVEL_MODE).catch(
            () => []
          )
        : [];
    res.json({
      matches: page.map((match, index) => ({ ...match, travelMinutes: minutes.at(index) ?? null })),
      nextCursor: end < ranked.length ? String(end) : null,
    });
  }));

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
    const found = await store.listings.listOpen(currentUser(res).id, limit + 1, before);
    const page = found.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = found.length > limit && last !== undefined ? last.id : null;
    res.json({ listings: page, nextCursor });
  }));

  return router;
}
