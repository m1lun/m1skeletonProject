import { CONDITIONS, type RequestField } from '../models/common';
import type { Listing } from '../models/listing';
import type { BuyerRequest } from '../models/request';
import { distanceKm } from './distance';
import { conditionIndex, meetsField, radiusKm, requestValue } from './satisfies';

export type Post = BuyerRequest | Listing;

// How much the viewer cares about each part of the score, from 0 ("doesn't matter")
// to 5 ("very important"), as set on the preferences screen.
export interface Weights {
  price: number;
  condition: number;
  distance: number;
  match: number;
}

// Used until the viewer has saved preferences.
export const DEFAULT_WEIGHTS: Weights = { price: 3, condition: 3, distance: 3, match: 3 };

// The score when there is nothing to compare, such as a preferred brand the listing left blank.
const NEUTRAL = 0.5;

// Request fields with their own part of the score, so they are left out of the match part.
const SCORED_SEPARATELY = ['price', 'condition', 'radiuskm'];

export interface RankedMatch<T extends Post> {
  post: T;
  score: number;
  distanceKm: number;
}

export function isRequest(post: Post): post is BuyerRequest {
  return 'requestFields' in post;
}

// The request and listing in a pair, whichever side the viewer is on.
export function asPair(source: Post, candidate: Post): { request: BuyerRequest; listing: Listing } {
  return isRequest(source)
    ? { request: source, listing: candidate as Listing }
    : { request: candidate as BuyerRequest, listing: source };
}

// Each importance divided by their total, so the weights add up to 1: 5, 3, 2, 2 gives
// about 0.42, 0.25, 0.17, 0.17. All zero counts the four parts equally.
export function normaliseWeights(weights: Weights): Weights {
  const total = weights.price + weights.condition + weights.distance + weights.match;
  if (total === 0) {
    return { price: 0.25, condition: 0.25, distance: 0.25, match: 0.25 };
  }
  return {
    price: weights.price / total,
    condition: weights.condition / total,
    distance: weights.distance / total,
    match: weights.match / total,
  };
}

function clamp(score: number): number {
  return Math.min(1, Math.max(0, score));
}

// Cheaper relative to the buyer's maximum is better: free scores 1, the maximum scores 0.
function priceScore(request: BuyerRequest, listing: Listing): number {
  const maximum = requestValue(request, 'price');
  if (typeof maximum !== 'number') {
    return NEUTRAL;
  }
  if (maximum === 0) {
    return listing.price === 0 ? 1 : 0;
  }
  return clamp(1 - listing.price / maximum);
}

// New scores 1, poor scores 0.
function conditionScore(listing: Listing): number {
  return 1 - conditionIndex(listing.condition) / (CONDITIONS.length - 1);
}

// Nearer is better: the same spot scores 1, the edge of the buyer's radius scores 0.
function distanceScore(km: number, request: BuyerRequest): number {
  const radius = radiusKm(request);
  return radius > 0 ? clamp(1 - km / radius) : 1;
}

function preferenceScore(field: RequestField, listing: Listing): number {
  const met = meetsField(field, listing);
  if (met === undefined) {
    return NEUTRAL;
  }
  return met ? 1 : 0;
}

// The share of the buyer's soft preferences (brand, colour, size, custom fields) the
// listing meets. Hard fields are left out: every candidate already meets them.
function matchScore(request: BuyerRequest, listing: Listing): number {
  const preferences = request.requestFields.filter(
    (field) => !field.hard && !SCORED_SEPARATELY.includes(field.key)
  );
  if (preferences.length === 0) {
    return NEUTRAL;
  }
  const total = preferences.reduce((sum, field) => sum + preferenceScore(field, listing), 0);
  return total / preferences.length;
}

// Scores each candidate from 0 to 1 on price, condition, distance and match, combines
// the four with the viewer's weights, and orders the best first. A pair scores the same
// in both feeds; only the viewer's weights differ. Ties go to the nearer, then the newer post.
export function rank<T extends Post>(source: Post, candidates: T[], weights: Weights): RankedMatch<T>[] {
  const share = normaliseWeights(weights);
  return candidates
    .map((post) => {
      const { request, listing } = asPair(source, post);
      const km = distanceKm(request.location, listing.location);
      const score =
        share.price * priceScore(request, listing) +
        share.condition * conditionScore(listing) +
        share.distance * distanceScore(km, request) +
        share.match * matchScore(request, listing);
      return { post, score, distanceKm: km };
    })
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm || b.post.id.localeCompare(a.post.id));
}
