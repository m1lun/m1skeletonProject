import type { FieldDefinition } from '../models/fieldDefinition';
import type { Option } from '../models/option';

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

export interface Store {
  listings: PostRepo<import('../models/listing').Listing>;
  requests: PostRepo<import('../models/request').BuyerRequest>;
  options: OptionRepo;
  fields: FieldRepo;
  close(): Promise<void>;
}
