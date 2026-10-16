import { MongoClient, ObjectId, type Collection, type Db, type Document } from 'mongodb';

import { FIELD_DEFINITIONS_COLLECTION, type FieldDefinition } from '../models/fieldDefinition';
import { postIndexes } from '../models/common';
import { LISTINGS_COLLECTION, type Listing } from '../models/listing';
import { OPTIONS_COLLECTION, type Option } from '../models/option';
import { REQUESTS_COLLECTION, type BuyerRequest } from '../models/request';
import type { FieldRepo, OptionRepo, PostDoc, PostRepo, Store } from './types';

type Stored<T> = Omit<T, 'id'> & { _id: ObjectId };

function toDoc<T extends { id: string }>(stored: Stored<T>): T {
  const { _id, ...rest } = stored;
  return { ...rest, id: _id.toHexString() } as unknown as T;
}

// Drops Mongo's _id so option and field documents match their model types.
function withoutId<T>(stored: Record<string, unknown>): T {
  const copy: Record<string, unknown> = { ...stored };
  delete copy._id;
  return copy as T;
}

function withoutIds<T>(found: Record<string, unknown>[]): T[] {
  const results: T[] = [];
  for (const stored of found) {
    results.push(withoutId<T>(stored));
  }
  return results;
}

class MongoPostRepo<T extends PostDoc & { category: string }> implements PostRepo<T> {
  constructor(private readonly collection: Collection<Document>) {}

  async insert(doc: Omit<T, 'id'>): Promise<T> {
    const _id = new ObjectId();
    await this.collection.insertOne({ ...doc, _id });
    return { ...doc, id: _id.toHexString() } as T;
  }

  async findById(id: string): Promise<T | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    const found = await this.collection.findOne({ _id: new ObjectId(id) });
    return found === null ? null : toDoc<T>(found as unknown as Stored<T>);
  }

  async listByOwner(ownerId: string): Promise<T[]> {
    const found = await this.collection.find({ ownerId }).sort({ createdAt: -1 }).toArray();
    const stored = found as unknown as Stored<T>[];
    return stored.map((d) => toDoc<T>(d));
  }

  async replace(doc: T): Promise<void> {
    const { id, ...rest } = doc;
    await this.collection.replaceOne({ _id: new ObjectId(id) }, rest);
  }

  async remove(id: string): Promise<void> {
    await this.collection.deleteOne({ _id: new ObjectId(id) });
  }
}

class MongoOptionRepo implements OptionRepo {
  constructor(private readonly collection: Collection<Document>) {}

  async list(field: string): Promise<Option[]> {
    const found = (await this.collection
      .find({ field })
      .sort({ label: 1 })
      .toArray()) as unknown as Record<string, unknown>[];
    return withoutIds<Option>(found);
  }

  async find(field: string, key: string): Promise<Option | null> {
    const found = await this.collection.findOne({ field, key });
    if (found === null) {
      return null;
    }
    return withoutId<Option>(found as unknown as Record<string, unknown>);
  }

  async ensure(option: Option): Promise<Option> {
    const stored = await this.collection.findOneAndUpdate(
      { field: option.field, key: option.key },
      { $setOnInsert: option },
      { upsert: true, returnDocument: 'after' },
    );
    return stored === null ? option : withoutId<Option>(stored as unknown as Record<string, unknown>);
  }

  async ensureMany(options: Option[]): Promise<void> {
    if (options.length === 0) {
      return;
    }
    await this.collection.bulkWrite(
      options.map((option) => ({
        updateOne: {
          filter: { field: option.field, key: option.key },
          update: { $setOnInsert: option },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
}

class MongoFieldRepo implements FieldRepo {
  constructor(private readonly collection: Collection<Document>) {}

  async list(ownerId: string): Promise<FieldDefinition[]> {
    const found = (await this.collection.find({ ownerId }).toArray()) as unknown as Record<
      string,
      unknown
    >[];
    return withoutIds<FieldDefinition>(found);
  }

  async upsert(def: FieldDefinition): Promise<FieldDefinition> {
    await this.collection.updateOne(
      { ownerId: def.ownerId, key: def.key },
      { $set: def },
      { upsert: true },
    );
    return def;
  }

  async remove(ownerId: string, key: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ ownerId, key });
    return result.deletedCount === 1;
  }
}

async function createIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection(LISTINGS_COLLECTION).createIndexes([...postIndexes]),
    db.collection(REQUESTS_COLLECTION).createIndexes([...postIndexes]),
    db.collection(OPTIONS_COLLECTION).createIndex({ field: 1, key: 1 }, { unique: true }),
    db.collection(FIELD_DEFINITIONS_COLLECTION).createIndex({ ownerId: 1, key: 1 }, { unique: true }),
  ]);
}

export async function createMongoStore(uri: string, dbName: string): Promise<Store> {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  await createIndexes(db);
  return {
    listings: new MongoPostRepo<Listing>(db.collection(LISTINGS_COLLECTION)),
    requests: new MongoPostRepo<BuyerRequest>(db.collection(REQUESTS_COLLECTION)),
    options: new MongoOptionRepo(db.collection(OPTIONS_COLLECTION)),
    fields: new MongoFieldRepo(db.collection(FIELD_DEFINITIONS_COLLECTION)),
    close: async () => {
      await client.close();
    },
  };
}
