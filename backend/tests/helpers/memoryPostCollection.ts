import type { Listing } from '../../src/models/listing';
import type { BuyerRequest } from '../../src/models/request';
import { EARTH_RADIUS_KM, type OpenPostFilter, type PostCollection, type PostDoc, type PostFilter } from '../../src/store/types';

// Stands in for MongoPostCollection with the same rules, so post routes can be
// tested without a database. Ids are 24 hex characters that grow with each
// insert and, like MongoDB ObjectIds, are unique across every collection, so a
// listing and a request never share one. `rows` is exposed so tests can inspect it.
export class MemoryPostCollection<T extends PostDoc> implements PostCollection<T> {
  private static nextId = 1;
  readonly rows: T[] = [];

  insert(doc: Omit<T, 'id'>): Promise<T> {
    const post = { ...doc, id: (MemoryPostCollection.nextId++).toString(16).padStart(24, '0') } as T;
    this.rows.push(post);
    return Promise.resolve({ ...post });
  }

  findById(id: string): Promise<T | null> {
    const post = this.rows.find((row) => row.id === id);
    return Promise.resolve(post === undefined ? null : { ...post });
  }

  listByOwner(ownerId: string): Promise<T[]> {
    return Promise.resolve(this.newestFirst().filter((row) => row.ownerId === ownerId));
  }

  replace(doc: T): Promise<T> {
    const index = this.rows.findIndex((row) => row.id === doc.id);
    this.rows.splice(index, 1, { ...doc });
    return Promise.resolve({ ...doc });
  }

  remove(id: string): Promise<void> {
    const kept = this.rows.filter((row) => row.id !== id);
    this.rows.splice(0, this.rows.length, ...kept);
    return Promise.resolve();
  }

  listOpen(excludeOwnerId: string, limit: number, filter: OpenPostFilter = {}): Promise<T[]> {
    const open = this.newestFirst().filter(
      (row) =>
        row.status === 'open' &&
        row.ownerId !== excludeOwnerId &&
        (filter.before === undefined || row.id < filter.before) &&
        // Only the feed calls listOpen, and it only reads listings and requests.
        passesFilter(row as unknown as Listing | BuyerRequest, filter)
    );
    return Promise.resolve(open.slice(0, limit));
  }

  listOpenInCategory(category: string, excludeOwnerId: string): Promise<T[]> {
    return Promise.resolve(
      this.newestFirst().filter(
        (row) => row.status === 'open' && row.category === category && row.ownerId !== excludeOwnerId
      )
    );
  }

  private newestFirst(): T[] {
    return this.rows.map((row) => ({ ...row })).sort((a, b) => b.id.localeCompare(a.id));
  }
}

function distanceKm(from: { lat: number; lng: number }, post: Listing | BuyerRequest): number {
  const [lng, lat] = post.location.coordinates;
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat - from.lat);
  const dLng = toRadians(lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function price(post: Listing | BuyerRequest): number | undefined {
  if ('price' in post) {
    return post.price;
  }
  const budget = post.requestFields.find((field) => field.key === 'price')?.value;
  return typeof budget === 'number' ? budget : undefined;
}

// The same rule as MongoPostCollection.listOpen. A request with no budget fails any
// price filter, as it does in MongoDB.
function passesFilter(post: Listing | BuyerRequest, filter: PostFilter): boolean {
  const { category, minPrice, maxPrice, near } = filter;
  const postPrice = price(post);
  return (
    (category === undefined || post.category === category) &&
    (minPrice === undefined || (postPrice !== undefined && postPrice >= minPrice)) &&
    (maxPrice === undefined || (postPrice !== undefined && postPrice <= maxPrice)) &&
    (near === undefined || distanceKm(near, post) <= near.radiusKm)
  );
}

// A valid open listing for tests; pass overrides for the fields a test cares about.
export function newListing(ownerId: string, overrides: Partial<Omit<Listing, 'id'>> = {}): Omit<Listing, 'id'> {
  const now = new Date();
  return {
    ownerId,
    category: 'furniture',
    price: 40,
    condition: 'good',
    description: 'A sturdy desk',
    address: '6335 Thunderbird Cres',
    location: { type: 'Point', coordinates: [-123.25, 49.26] },
    photoIds: ['6ad40b88e74dd3678bfef8f3'],
    listingFields: [],
    status: 'open',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// A valid open request for tests: furniture up to $100 near the default listing.
// Pass overrides for the fields a test cares about.
export function newRequest(ownerId: string, overrides: Partial<Omit<BuyerRequest, 'id'>> = {}): Omit<BuyerRequest, 'id'> {
  const now = new Date();
  return {
    ownerId,
    category: 'furniture',
    description: 'Looking for a desk',
    address: '2329 West Mall',
    location: { type: 'Point', coordinates: [-123.25, 49.26] },
    photoIds: [],
    requestFields: [{ key: 'price', label: 'Max price', kind: 'builtin', type: 'number', value: 100, hard: true }],
    status: 'open',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
