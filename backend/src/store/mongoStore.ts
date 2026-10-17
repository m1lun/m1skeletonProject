import { MongoClient, ObjectId, type Collection, type Db, type Document } from 'mongodb';

import { FIELD_DEFINITIONS_COLLECTION, type FieldDefinition } from '../models/fieldDefinition';
import { postIndexes } from '../models/common';
import { normaliseListing, normaliseRequest } from '../models/normalise';
import { fieldDefinitionSchema, listingSchema, optionSchema, requestSchema } from '../models/schema';
import { LISTINGS_COLLECTION, type Listing } from '../models/listing';
import { OPTIONS_COLLECTION, type Option } from '../models/option';
import { REQUESTS_COLLECTION, type BuyerRequest } from '../models/request';
import type { FieldRepo, OptionRepo, PostDoc, PostRepo, Store } from './types';

type Stored<T> = Omit<T, 'id'> & { _id: ObjectId };

function toDoc<T extends { id: string }>(stored: Stored<T>): T {
  const { _id, ...rest } = stored;
  return { ...rest, id: _id.toHexString() } as unknown as T;
}

// Options and field definitions have no id of their own, so Mongo leaves _id out.
const WITHOUT_ID = { projection: { _id: 0 } };

class MongoPostRepo<T extends PostDoc & { category: string }> implements PostRepo<T> {
  constructor(
    private readonly collection: Collection<Document>,
    // Tidies a post (lower-case keys, trimmed text, no duplicate rows) before it is saved.
    private readonly normalise: (doc: Omit<T, 'id'>) => Omit<T, 'id'>,
  ) {}

  async insert(doc: Omit<T, 'id'>): Promise<T> {
    const clean = this.normalise(doc);
    const _id = new ObjectId();
    await this.collection.insertOne({ ...clean, _id });
    return { ...clean, id: _id.toHexString() } as T;
  }

  async findById(id: string): Promise<T | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    const found = await this.collection.findOne({ _id: new ObjectId(id) });
    return found === null ? null : toDoc<T>(found as Stored<T>);
  }

  async listByOwner(ownerId: string): Promise<T[]> {
    const found = await this.collection.find({ ownerId }).sort({ createdAt: -1 }).toArray();
    const stored = found as Stored<T>[];
    return stored.map((d) => toDoc<T>(d));
  }

  async replace(doc: T): Promise<void> {
    const { id, ...rest } = doc;
    await this.collection.replaceOne({ _id: new ObjectId(id) }, this.normalise(rest));
  }

  async remove(id: string): Promise<void> {
    await this.collection.deleteOne({ _id: new ObjectId(id) });
  }
}

class MongoOptionRepo implements OptionRepo {
  constructor(private readonly collection: Collection<Document>) {}

  async list(field: string): Promise<Option[]> {
    const found = await this.collection.find({ field }, WITHOUT_ID).sort({ label: 1 }).toArray();
    return found as unknown as Option[];
  }

  async find(field: string, key: string): Promise<Option | null> {
    const found = await this.collection.findOne({ field, key }, WITHOUT_ID);
    return found as Option | null;
  }

  async ensure(option: Option): Promise<Option> {
    const stored = await this.collection.findOneAndUpdate(
      { field: option.field, key: option.key },
      { $setOnInsert: option },
      { upsert: true, returnDocument: 'after', ...WITHOUT_ID },
    );
    return (stored as Option | null) ?? option;
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
    const found = await this.collection.find({ ownerId }, WITHOUT_ID).toArray();
    return found as unknown as FieldDefinition[];
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

// Creates the collection with its validator, or updates the validator if it already exists.
async function applySchema(db: Db, name: string, jsonSchema: Document): Promise<void> {
  const validator = { $jsonSchema: jsonSchema };
  const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
  if (exists) {
    await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
  } else {
    await db.createCollection(name, { validator });
  }
}

async function setupCollections(db: Db): Promise<void> {
  await Promise.all([
    applySchema(db, LISTINGS_COLLECTION, listingSchema),
    applySchema(db, REQUESTS_COLLECTION, requestSchema),
    applySchema(db, OPTIONS_COLLECTION, optionSchema),
    applySchema(db, FIELD_DEFINITIONS_COLLECTION, fieldDefinitionSchema),
  ]);
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
  await setupCollections(db);
  return {
    listings: new MongoPostRepo<Listing>(db.collection(LISTINGS_COLLECTION), normaliseListing),
    requests: new MongoPostRepo<BuyerRequest>(db.collection(REQUESTS_COLLECTION), normaliseRequest),
    options: new MongoOptionRepo(db.collection(OPTIONS_COLLECTION)),
    fields: new MongoFieldRepo(db.collection(FIELD_DEFINITIONS_COLLECTION)),
    close: async () => {
      await client.close();
    },
  };
}
