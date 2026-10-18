import type { Listing } from '../../src/models/listing';
import type { PostCollection, PostDoc } from '../../src/store/types';

// Stands in for MongoPostCollection with the same rules, so post routes can be
// tested without a database. Ids are 24 hex characters that grow with each
// insert, like MongoDB ObjectIds. `rows` is exposed so tests can inspect it.
export class MemoryPostCollection<T extends PostDoc> implements PostCollection<T> {
  readonly rows: T[] = [];
  private nextId = 1;

  insert(doc: Omit<T, 'id'>): Promise<T> {
    const post = { ...doc, id: (this.nextId++).toString(16).padStart(24, '0') } as T;
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

  listOpen(excludeOwnerId: string, limit: number, before?: string): Promise<T[]> {
    const open = this.newestFirst().filter(
      (row) => row.status === 'open' && row.ownerId !== excludeOwnerId && (before === undefined || row.id < before)
    );
    return Promise.resolve(open.slice(0, limit));
  }

  private newestFirst(): T[] {
    return this.rows.map((row) => ({ ...row })).sort((a, b) => b.id.localeCompare(a.id));
  }
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
