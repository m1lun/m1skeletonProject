import type { MemoryPostCollection } from './memoryPostCollection';
import { newListing } from './memoryPostCollection';
import type { MemoryStore } from './memoryStore';
import { listingBody, newRequest, requestBody } from './postFixtures';
import type { PostDoc } from '../../src/store/types';

export type TestPost = PostDoc & { description: string };

export interface PostKind {
  path: 'listings' | 'requests';
  collection(store: MemoryStore): MemoryPostCollection<TestPost>;
  seed(store: MemoryStore, ownerId: string): Promise<TestPost>;
  body(): Record<string, unknown>;
  invalidChange: Record<string, unknown>;
  invalidMessage: string;
}

export const POST_KINDS: PostKind[] = [
  {
    path: 'listings',
    collection: (store) => store.listings as unknown as MemoryPostCollection<TestPost>,
    seed: (store, ownerId) => store.listings.insert(newListing(ownerId)),
    body: listingBody,
    invalidChange: { price: -5 },
    invalidMessage: 'price must be a number of at least 0',
  },
  {
    path: 'requests',
    collection: (store) => store.requests as unknown as MemoryPostCollection<TestPost>,
    seed: (store, ownerId) => store.requests.insert(newRequest(ownerId)),
    body: requestBody,
    invalidChange: { requestFields: [] },
    invalidMessage: 'a max price is required',
  },
];
