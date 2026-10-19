import type { FieldValue, GeoPoint, PostField, RequestField } from '../../src/models/common';
import type { Listing } from '../../src/models/listing';
import type { BuyerRequest } from '../../src/models/request';
import { distanceKm } from '../../src/matching/distance';
import { DEFAULT_WEIGHTS, normaliseWeights, rank, type Weights } from '../../src/matching/rank';
import { satisfies } from '../../src/matching/satisfies';
import { newListing, newRequest } from '../helpers/memoryPostCollection';

// The point newRequest and newListing use. 0.01° of latitude is about 1.1 km.
const HOME: [number, number] = [-123.25, 49.26];

function north(degrees: number): GeoPoint {
  return { type: 'Point', coordinates: [HOME[0], HOME[1] + degrees] };
}

function typeOf(value: FieldValue): PostField['type'] {
  if (typeof value === 'object') {
    return 'dimensions';
  }
  if (typeof value === 'string') {
    return 'text';
  }
  return typeof value === 'boolean' ? 'bool' : 'number';
}

// A listing field.
function has(key: string, value: FieldValue, kind: PostField['kind'] = 'builtin'): PostField {
  return { key, label: key, kind, type: typeOf(value), value };
}

// A request field the buyer marked hard (must-have) or soft (preference).
function want(key: string, value: FieldValue, hard: boolean, kind: PostField['kind'] = 'builtin'): RequestField {
  return { ...has(key, value, kind), hard };
}

let nextId = 1;
function withId<T>(post: Omit<T, 'id'>): T {
  return { ...post, id: (nextId++).toString(16).padStart(24, '0') } as T;
}

// A request for furniture up to $100, plus any extra fields.
function buyer(fields: RequestField[] = [], overrides: Partial<BuyerRequest> = {}): BuyerRequest {
  return withId<BuyerRequest>(
    newRequest('buyer', { requestFields: [want('price', 100, true), ...fields], ...overrides })
  );
}

function seller(overrides: Partial<Listing> = {}): Listing {
  return withId<Listing>(newListing('seller', overrides));
}

const ids = (matches: { post: { id: string } }[]): string[] => matches.map((match) => match.post.id);

describe('distanceKm', () => {
  test('is zero between the same point', () => {
    expect(distanceKm(north(0), north(0))).toBe(0);
  });

  test('one degree of latitude is about 111 km', () => {
    expect(distanceKm({ type: 'Point', coordinates: [0, 0] }, { type: 'Point', coordinates: [0, 1] })).toBeCloseTo(
      111.19,
      1
    );
  });
});

describe('satisfies', () => {
  test('a listing in the same category, under the max price and nearby matches', () => {
    expect(satisfies(buyer(), seller())).toBe(true);
  });

  test('a different category never matches', () => {
    expect(satisfies(buyer(), seller({ category: 'electronics' }))).toBe(false);
  });

  test('the radius defaults to 10 km and can be widened', () => {
    const elevenKmAway = seller({ location: north(0.1) });
    expect(satisfies(buyer(), elevenKmAway)).toBe(false);
    expect(satisfies(buyer([want('radiuskm', 20, true)]), elevenKmAway)).toBe(true);
  });

  test('the radius applies even when the buyer did not mark it hard', () => {
    expect(satisfies(buyer([want('radiuskm', 5, false)]), seller({ location: north(0.1) }))).toBe(false);
  });

  test('a hard max price filters, a soft one does not', () => {
    const expensive = seller({ price: 150 });
    expect(satisfies(buyer(), expensive)).toBe(false);
    const softPrice = withId<BuyerRequest>(newRequest('buyer', { requestFields: [want('price', 100, false)] }));
    expect(satisfies(softPrice, expensive)).toBe(true);
  });

  test('a hard minimum condition allows that condition or better', () => {
    const request = buyer([want('condition', 'like new', true)]);
    expect(satisfies(request, seller({ condition: 'new' }))).toBe(true);
    expect(satisfies(request, seller({ condition: 'like new' }))).toBe(true);
    expect(satisfies(request, seller({ condition: 'good' }))).toBe(false);
  });

  test('a hard max size allows the item in any orientation', () => {
    const request = buyer([want('dimensions', { width: 100, height: 50, depth: 40 }, true)]);
    const turned = seller({ listingFields: [has('dimensions', { width: 50, height: 100, depth: 40 })] });
    const tooBig = seller({ listingFields: [has('dimensions', { width: 120, height: 50, depth: 40 })] });
    expect(satisfies(request, turned)).toBe(true);
    expect(satisfies(request, tooBig)).toBe(false);
  });

  test('a listing that leaves a hard field blank is left out', () => {
    const request = buyer([want('dimensions', { width: 100, height: 50, depth: 40 }, true)]);
    expect(satisfies(request, seller())).toBe(false);
  });

  test('a hard brand matches ignoring case and spacing', () => {
    const request = buyer([want('brand', 'IKEA', true)]);
    expect(satisfies(request, seller({ listingFields: [has('brand', ' ikea ')] }))).toBe(true);
    expect(satisfies(request, seller({ listingFields: [has('brand', 'muji')] }))).toBe(false);
  });

  test('a soft brand never filters', () => {
    expect(satisfies(buyer([want('brand', 'ikea', false)]), seller({ listingFields: [has('brand', 'muji')] }))).toBe(true);
  });

  test('a hard custom field must be equal', () => {
    const request = buyer([want('drawers', 3, true, 'custom')]);
    expect(satisfies(request, seller({ listingFields: [has('drawers', 3, 'custom')] }))).toBe(true);
    expect(satisfies(request, seller({ listingFields: [has('drawers', 4, 'custom')] }))).toBe(false);
  });
});

describe('normaliseWeights', () => {
  test('divides each importance by the total', () => {
    const weights = normaliseWeights({ price: 5, condition: 3, distance: 2, match: 2 });
    expect(weights.price).toBeCloseTo(0.4167, 4);
    expect(weights.condition).toBeCloseTo(0.25, 4);
    expect(weights.distance).toBeCloseTo(0.1667, 4);
    expect(weights.match).toBeCloseTo(0.1667, 4);
  });

  test('all zero counts the four parts equally', () => {
    expect(normaliseWeights({ price: 0, condition: 0, distance: 0, match: 0 })).toEqual({
      price: 0.25,
      condition: 0.25,
      distance: 0.25,
      match: 0.25,
    });
  });
});

describe('rank', () => {
  const only = (part: keyof Weights): Weights => ({ price: 0, condition: 0, distance: 0, match: 0, [part]: 1 });

  test('cheaper relative to the max price ranks higher', () => {
    const cheap = seller({ price: 20 });
    const dear = seller({ price: 90 });
    expect(ids(rank(buyer(), [dear, cheap], DEFAULT_WEIGHTS))).toEqual([cheap.id, dear.id]);
  });

  test('better condition ranks higher', () => {
    const worn = seller({ condition: 'fair' });
    const mint = seller({ condition: 'new' });
    expect(ids(rank(buyer(), [worn, mint], DEFAULT_WEIGHTS))).toEqual([mint.id, worn.id]);
  });

  test('nearer ranks higher', () => {
    const far = seller({ location: north(0.05) });
    const near = seller({ location: north(0.01) });
    expect(ids(rank(buyer(), [far, near], DEFAULT_WEIGHTS))).toEqual([near.id, far.id]);
  });

  test('a met soft preference ranks above a blank one, which ranks above a missed one', () => {
    const request = buyer([want('brand', 'ikea', false)]);
    const missed = seller({ listingFields: [has('brand', 'muji')] });
    const blank = seller();
    const met = seller({ listingFields: [has('brand', 'ikea')] });
    expect(ids(rank(request, [missed, blank, met], DEFAULT_WEIGHTS))).toEqual([met.id, blank.id, missed.id]);
  });

  test('the weights decide which part wins', () => {
    const cheapButFar = seller({ price: 10, location: north(0.08) });
    const dearButNear = seller({ price: 90, location: north(0) });
    expect(ids(rank(buyer(), [dearButNear, cheapButFar], only('price')))).toEqual([cheapButFar.id, dearButNear.id]);
    expect(ids(rank(buyer(), [cheapButFar, dearButNear], only('distance')))).toEqual([dearButNear.id, cheapButFar.id]);
  });

  test('scores are between 0 and 1 and report the distance', () => {
    const [match] = rank(buyer(), [seller({ price: 0, condition: 'new' })], DEFAULT_WEIGHTS);
    expect(match?.distanceKm).toBe(0);
    // Price, condition and distance are perfect; with no preferences, match is neutral.
    expect(match?.score).toBeCloseTo(0.75 + 0.25 * 0.5, 6);
  });

  test('a max price of 0 means only free items score on price', () => {
    const freeOnly = withId<BuyerRequest>(newRequest('buyer', { requestFields: [want('price', 0, false)] }));
    const free = seller({ price: 0 });
    const paid = seller({ price: 5 });
    expect(ids(rank(freeOnly, [paid, free], only('price')))).toEqual([free.id, paid.id]);
  });

  test('a request without a max price scores price as neutral', () => {
    const noPrice = withId<BuyerRequest>(newRequest('buyer', { requestFields: [] }));
    const [match] = rank(noPrice, [seller()], only('price'));
    expect(match?.score).toBe(0.5);
  });

  test('a radius of 0 scores a listing at the same spot as nearest', () => {
    const [match] = rank(buyer([want('radiuskm', 0, true)]), [seller()], only('distance'));
    expect(match?.score).toBe(1);
  });

  test('a pair scores the same from the seller side', () => {
    const request = buyer([want('brand', 'ikea', false)]);
    const listing = seller({ price: 30, location: north(0.02) });
    const [fromBuyer] = rank(request, [listing], DEFAULT_WEIGHTS);
    const [fromSeller] = rank(listing, [request], DEFAULT_WEIGHTS);
    expect(fromSeller?.post.id).toBe(request.id);
    expect(fromSeller?.score).toBeCloseTo(fromBuyer?.score ?? -1, 10);
  });

  test('ties go to the newer post', () => {
    const older = seller();
    const newer = seller();
    expect(ids(rank(buyer(), [older, newer], DEFAULT_WEIGHTS))).toEqual([newer.id, older.id]);
  });
});
