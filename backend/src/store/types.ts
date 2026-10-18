import type { GeoPoint } from '../models/common';
import type { CustomField } from '../models/customField';
import type { Option } from '../models/option';
import type { RefreshSession } from '../models/session';

export interface PostDoc {
  id: string;
  ownerId: string;
  status: 'open' | 'closed';
  location: GeoPoint;
  updatedAt: Date;
}

// Posts (listings or requests) are stored without an id; the store assigns one.
export interface PostCollection<T extends PostDoc> {
  insert(doc: Omit<T, 'id'>): Promise<T>;
  findById(id: string): Promise<T | null>;
  listByOwner(ownerId: string): Promise<T[]>;
  replace(doc: T): Promise<T>;
  remove(id: string): Promise<void>;
  // Open posts from everyone except excludeOwnerId, newest first. With `before`
  // (a post id), only posts older than that one, so a page starts where the last ended.
  listOpen(excludeOwnerId: string, limit: number, before?: string): Promise<T[]>;
}

export interface OptionCollection {
  list(field: string): Promise<Option[]>;
  find(field: string, key: string): Promise<Option | null>;
  // Inserts if missing and returns the stored option either way.
  ensure(option: Option): Promise<Option>;
  // Inserts every missing option in a single round trip; existing ones are untouched.
  ensureMany(options: Option[]): Promise<void>;
}

export interface CustomFieldCollection {
  list(ownerId: string): Promise<CustomField[]>;
  upsert(def: CustomField): Promise<CustomField>;
  remove(ownerId: string, key: string): Promise<boolean>;
}

export interface SessionRepo {
  insert(session: RefreshSession): Promise<void>;
  // Marks an unused, unexpired token as used and returns it, in one atomic
  // step so two concurrent refreshes cannot both succeed. Null otherwise.
  consume(tokenHash: string, now: Date): Promise<RefreshSession | null>;
  find(tokenHash: string): Promise<RefreshSession | null>;
  revokeFamily(familyId: string): Promise<void>;
}

export interface Store {
  listings: PostCollection<import('../models/listing').Listing>;
  requests: PostCollection<import('../models/request').BuyerRequest>;
  options: OptionCollection;
  customFields: CustomFieldCollection;
  sessions: SessionRepo;
  close(): Promise<void>;
}
