import type { FieldDefinition } from '../models/fieldDefinition';
import type { Option } from '../models/option';
import type { RefreshSession } from '../models/session';

export interface PostDoc {
  id: string;
  ownerId: string;
  status: 'open' | 'closed';
  updatedAt: Date;
}

// Posts (listings or requests) are stored without an id; the store assigns one.
export interface PostRepo<T extends PostDoc> {
  insert(doc: Omit<T, 'id'>): Promise<T>;
  findById(id: string): Promise<T | null>;
  listByOwner(ownerId: string): Promise<T[]>;
  replace(doc: T): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface OptionRepo {
  list(field: string): Promise<Option[]>;
  find(field: string, key: string): Promise<Option | null>;
  // Inserts if missing and returns the stored option either way.
  ensure(option: Option): Promise<Option>;
  // Inserts every missing option in a single round trip; existing ones are untouched.
  ensureMany(options: Option[]): Promise<void>;
}

export interface FieldRepo {
  list(ownerId: string): Promise<FieldDefinition[]>;
  upsert(def: FieldDefinition): Promise<FieldDefinition>;
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
  listings: PostRepo<import('../models/listing').Listing>;
  requests: PostRepo<import('../models/request').BuyerRequest>;
  options: OptionRepo;
  fields: FieldRepo;
  sessions: SessionRepo;
  close(): Promise<void>;
}
