import { Router } from 'express';
import type { Request, Response } from 'express';

import { BadRequestError } from '../errors';
import { MAX_COMMENT_LENGTH, MAX_STARS, MIN_STARS } from '../models/common';
import type { Rating } from '../models/rating';
import type { Reputation } from '../models/reputation';
import { averageScore } from '../reputation/score';
import { currentUser } from '../sessions';
import type { Store } from '../store/types';
import { isObject } from './checks';
import { handle } from './handle';

// MongoDB's code for an insert that breaks a unique index.
const DUPLICATE_KEY = 11000;

function summary(userId: string, reputation: Reputation | null): { id: string; score: number | null; ratingCount: number } {
  return {
    id: userId,
    score: reputation === null ? null : averageScore(reputation.starSum, reputation.ratingCount),
    ratingCount: reputation?.ratingCount ?? 0,
  };
}

function parseRating(body: unknown): { stars: number; comment: string } {
  const errors: string[] = [];
  const fields = isObject(body) ? body : {};
  if (!isObject(body)) {
    errors.push('Request body must be a JSON object');
  }
  const { stars } = fields;
  if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < MIN_STARS || stars > MAX_STARS) {
    errors.push(`stars must be a whole number from ${MIN_STARS} to ${MAX_STARS}`);
  }
  let comment = '';
  if (fields.comment !== undefined) {
    if (typeof fields.comment === 'string' && fields.comment.trim().length <= MAX_COMMENT_LENGTH) {
      comment = fields.comment.trim();
    } else {
      errors.push(`comment must be text of at most ${MAX_COMMENT_LENGTH} characters`);
    }
  }
  if (errors.length > 0 || typeof stars !== 'number') {
    throw new BadRequestError(errors);
  }
  return { stars, comment };
}

// The caller's deal and the other party in it. Sends the 404 or 403 itself and returns null when there is none.
async function findMyDeal(
  store: Store,
  req: Request,
  res: Response,
): Promise<{ dealId: string; me: string; ratedUserId: string } | null> {
  const me = currentUser(res).id;
  const deal = await store.deals.findById(String(req.params.id));
  if (deal === null) {
    res.status(404).json({ error: 'Not Found' });
    return null;
  }
  if (deal.sellerId !== me && deal.buyerId !== me) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return { dealId: deal.id, me, ratedUserId: deal.sellerId === me ? deal.buyerId : deal.sellerId };
}

export function createRatingsRouter(store: Store): Router {
  const router = Router();

  // POST /api/deals/:id/ratings — the caller rates the other party of their deal and gets back that party's new score.
  router.post('/:id/ratings', handle(async (req, res) => {
    const { stars, comment } = parseRating(req.body);
    const myDeal = await findMyDeal(store, req, res);
    if (myDeal === null) {
      return;
    }
    const { dealId, me, ratedUserId } = myDeal;
    const now = new Date();

    let rating: Rating;
    try {
      rating = await store.ratings.insert({ dealId, raterId: me, ratedUserId, stars, comment, createdAt: now });
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY) {
        res.status(409).json({ error: 'You already rated this deal' });
        return;
      }
      throw error;
    }
    const reputation = await store.reputations.addRating(ratedUserId, stars, now);
    res.status(201).json({ rating, otherUser: summary(ratedUserId, reputation) });
  }));

  // PUT /api/deals/:id/ratings — the caller replaces their rating of the deal and gets back the other party's new score.
  router.put('/:id/ratings', handle(async (req, res) => {
    const { stars, comment } = parseRating(req.body);
    const myDeal = await findMyDeal(store, req, res);
    if (myDeal === null) {
      return;
    }
    const { dealId, me, ratedUserId } = myDeal;
    const now = new Date();

    const edited = await store.ratings.edit(dealId, me, stars, comment, now);
    if (edited === null) {
      res.status(404).json({ error: 'You have not rated this deal' });
      return;
    }
    const delta = stars - edited.previousStars;
    const reputation = delta === 0 ? await store.reputations.find(ratedUserId) : await store.reputations.changeStars(ratedUserId, delta, now);
    res.json({ rating: edited.rating, otherUser: summary(ratedUserId, reputation) });
  }));

  return router;
}

export function createReputationRouter(store: Store): Router {
  const router = Router();

  // GET /api/users/:id/reputation — a user's score and rating count; score is null when nobody has rated them.
  router.get('/:id/reputation', handle(async (req, res) => {
    const userId = String(req.params.id);
    const { id, score, ratingCount } = summary(userId, await store.reputations.find(userId));
    res.json({ userId: id, score, ratingCount });
  }));

  return router;
}
