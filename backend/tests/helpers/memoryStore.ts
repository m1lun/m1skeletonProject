import { Readable } from 'node:stream';

import type { CustomField } from '../../src/models/customField';
import type { Listing } from '../../src/models/listing';
import type { Option } from '../../src/models/option';
import type { BuyerRequest } from '../../src/models/request';
import type { PhotoStorage } from '../../src/photos/storage';
import type { CustomFieldCollection, OptionCollection, Store } from '../../src/store/types';
import { MemoryPostCollection } from './memoryPostCollection';
import { MemorySessionRepo } from './memorySessionRepo';

// Stands in for MongoOptionCollection with the same rules (listed by label,
// inserted only if missing), so option routes can be tested without a database.
export class MemoryOptionCollection implements OptionCollection {
  readonly rows: Option[] = [];

  list(field: string): Promise<Option[]> {
    const found = this.rows.filter((row) => row.field === field);
    return Promise.resolve(found.sort((a, b) => a.label.localeCompare(b.label)).map((row) => ({ ...row })));
  }

  find(field: string, key: string): Promise<Option | null> {
    const found = this.rows.find((row) => row.field === field && row.key === key);
    return Promise.resolve(found === undefined ? null : { ...found });
  }

  ensure(option: Option): Promise<Option> {
    const existing = this.rows.find((row) => row.field === option.field && row.key === option.key);
    if (existing !== undefined) {
      return Promise.resolve({ ...existing });
    }
    this.rows.push({ ...option });
    return Promise.resolve({ ...option });
  }

  async ensureMany(options: Option[]): Promise<void> {
    for (const option of options) {
      await this.ensure(option);
    }
  }
}

// Stands in for MongoCustomFieldCollection: one definition per owner and key.
export class MemoryCustomFieldCollection implements CustomFieldCollection {
  readonly rows: CustomField[] = [];

  list(ownerId: string): Promise<CustomField[]> {
    return Promise.resolve(this.rows.filter((row) => row.ownerId === ownerId).map((row) => ({ ...row })));
  }

  upsert(def: CustomField): Promise<CustomField> {
    const index = this.rows.findIndex((row) => row.ownerId === def.ownerId && row.key === def.key);
    if (index === -1) {
      this.rows.push({ ...def });
    } else {
      this.rows.splice(index, 1, { ...def });
    }
    return Promise.resolve({ ...def });
  }

  remove(ownerId: string, key: string): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.ownerId === ownerId && row.key === key);
    if (index === -1) {
      return Promise.resolve(false);
    }
    this.rows.splice(index, 1);
    return Promise.resolve(true);
  }
}

export interface StoredPhoto {
  data: Buffer;
  mimeType: string;
  ownerId: string;
}

// Stands in for the GridFS photo storage. Ids are 24 hex characters, like ObjectIds.
export class MemoryPhotoStorage implements PhotoStorage {
  readonly photos = new Map<string, StoredPhoto>();
  private nextId = 1;

  save(data: Buffer, mimeType: string, ownerId: string): Promise<string> {
    const id = (this.nextId++).toString(16).padStart(24, 'a');
    this.photos.set(id, { data, mimeType, ownerId });
    return Promise.resolve(id);
  }

  open(id: string): Promise<{ mimeType: string; stream: Readable } | null> {
    const photo = this.photos.get(id);
    return Promise.resolve(photo === undefined ? null : { mimeType: photo.mimeType, stream: Readable.from(photo.data) });
  }
}

// A whole store held in memory. The parts are exposed so tests can inspect them
// or make one fail.
export interface MemoryStore extends Store {
  listings: MemoryPostCollection<Listing>;
  requests: MemoryPostCollection<BuyerRequest>;
  options: MemoryOptionCollection;
  customFields: MemoryCustomFieldCollection;
  sessions: MemorySessionRepo;
  photos: MemoryPhotoStorage;
}

export function createMemoryStore(): MemoryStore {
  return {
    listings: new MemoryPostCollection<Listing>(),
    requests: new MemoryPostCollection<BuyerRequest>(),
    options: new MemoryOptionCollection(),
    customFields: new MemoryCustomFieldCollection(),
    sessions: new MemorySessionRepo(),
    photos: new MemoryPhotoStorage(),
    close: () => Promise.resolve(),
  };
}
