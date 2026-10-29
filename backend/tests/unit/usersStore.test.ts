import { MongoClient, type Db } from 'mongodb';

import type { GeoPoint } from '../../src/models/common';
import { USERS_COLLECTION } from '../../src/models/user';
import { createMongoStore } from '../../src/store/mongoStore';
import type { Store } from '../../src/store/types';

// Runs against a real but throwaway local MongoDB, for example:
//   docker run --rm -d --name mm-users-test -p 127.0.0.1:27018:27017 mongo:7
//   NODE_OPTIONS=--experimental-vm-modules TEST_MONGODB_URI=mongodb://127.0.0.1:27018 npx jest tests/unit/usersStore.test.ts
// The flag is needed because MongoDB driver 7 loads `os` with a dynamic import(), which
// Jest only supports with it; without it the server rejects the connection.
// Without TEST_MONGODB_URI the suite is skipped, so `npm test` needs no database.
const uri = process.env.TEST_MONGODB_URI ?? '';
const DB_NAME = 'matchmarket_users_test';

// The suite drops its database, so it must never reach a shared one.
if (uri !== '' && !/^mongodb:\/\/(localhost|127\.0\.0\.1)[:/]/.test(uri)) {
  throw new Error('TEST_MONGODB_URI must point at localhost or 127.0.0.1');
}

const describeWithDb = uri === '' ? describe.skip : describe;

const UBC: GeoPoint = { type: 'Point', coordinates: [-123.25, 49.26] };
const TERRY = { id: 'google-1', firstName: 'Terry', lastName: 'Teh', email: 'terry@example.com' };

// MongoDB error codes for a document that fails the validator, and for a duplicate key.
const VALIDATION_FAILED = 121;
const DUPLICATE_KEY = 11000;

describeWithDb('MongoUserCollection against a real MongoDB', () => {
  let client: MongoClient;
  let db: Db;
  let store: Store;

  beforeAll(async () => {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(DB_NAME);
    await db.dropDatabase();
    store = await createMongoStore(uri, DB_NAME);
  });

  beforeEach(async () => {
    await db.collection(USERS_COLLECTION).deleteMany({});
  });

  afterAll(async () => {
    await db.dropDatabase();
    await store.close();
    await client.close();
  });

  // Input: a user document written directly, without an email
  // Expected behavior: the collection exists with a $jsonSchema validator, which rejects the document
  // Expected output: MongoDB error 121
  test('Creates the users collection with a validator', async () => {
    const [collection] = await db.listCollections({ name: USERS_COLLECTION }).toArray();
    expect(collection).toHaveProperty('options.validator.$jsonSchema');

    const now = new Date();
    await expect(
      db.collection(USERS_COLLECTION).insertOne({ id: 'no-email', firstName: '', lastName: '', pictureUrl: null, createdAt: now, updatedAt: now }),
    ).rejects.toMatchObject({ code: VALIDATION_FAILED });
  });

  // Input: a first sign-in with names, email and photo
  // Expected behavior: the user is created
  // Expected output: the stored user with a createdAt date and no Mongo _id
  test('First sign-in creates the user', async () => {
    await store.users.upsertFromSignIn({ ...TERRY, pictureUrl: 'https://photo/1' });

    const user = await store.users.findById(TERRY.id);
    expect(user).toMatchObject({ ...TERRY, pictureUrl: 'https://photo/1' });
    expect(user?.createdAt).toBeInstanceOf(Date);
    expect(user).not.toHaveProperty('_id');
  });

  // Input: a second sign-in for the same id with new names, email and photo
  // Expected behavior: names and createdAt are kept; email and photo are refreshed
  // Expected output: the original names with the new email and photo
  test('A later sign-in keeps the names and refreshes email and photo', async () => {
    await store.users.upsertFromSignIn({ ...TERRY, pictureUrl: 'https://photo/1' });
    const first = await store.users.findById(TERRY.id);

    await store.users.upsertFromSignIn({ id: TERRY.id, firstName: 'New', lastName: 'Name', email: 'new@example.com', pictureUrl: 'https://photo/2' });

    const user = await store.users.findById(TERRY.id);
    expect(user).toMatchObject({ firstName: 'Terry', lastName: 'Teh', email: 'new@example.com', pictureUrl: 'https://photo/2' });
    expect(user?.createdAt).toEqual(first?.createdAt);
  });

  // Input: a token refresh (no pictureUrl) for an existing user, and for a new user
  // Expected behavior: the existing photo is kept; a new user starts without one
  // Expected output: the old photo URL, and null for the new user
  test('A refresh without a photo keeps the stored photo', async () => {
    await store.users.upsertFromSignIn({ ...TERRY, pictureUrl: 'https://photo/1' });
    await store.users.upsertFromSignIn(TERRY);
    await store.users.upsertFromSignIn({ id: 'google-2', firstName: 'Alex', lastName: '', email: 'alex@example.com' });

    expect((await store.users.findById(TERRY.id))?.pictureUrl).toBe('https://photo/1');
    expect((await store.users.findById('google-2'))?.pictureUrl).toBeNull();
  });

  // Input: two known ids, one unknown id, and an empty list
  // Expected behavior: one lookup returns only the users found, with public fields only
  // Expected output: exactly { id, firstName, lastName, pictureUrl } for each known user; [] for no ids
  test('findPublicByIds returns only the public fields of known users', async () => {
    await store.users.upsertFromSignIn({ ...TERRY, pictureUrl: 'https://photo/1' });
    await store.users.upsertFromSignIn({ id: 'google-2', firstName: 'Alex', lastName: 'Lee', email: 'alex@example.com', pictureUrl: null });
    await store.users.updateAddress(TERRY.id, { address: 'UBC, Vancouver', location: UBC });

    const found = await store.users.findPublicByIds([TERRY.id, 'google-2', 'unknown']);

    expect(found.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: TERRY.id, firstName: 'Terry', lastName: 'Teh', pictureUrl: 'https://photo/1' },
      { id: 'google-2', firstName: 'Alex', lastName: 'Lee', pictureUrl: null },
    ]);
    expect(await store.users.findPublicByIds([])).toEqual([]);
  });

  // Input: an address and location, then null, for an existing user; an address for an unknown id
  // Expected behavior: both fields are set together, then removed together
  // Expected output: the updated user each time; null for the unknown id
  test('updateAddress sets and clears the address and location together', async () => {
    await store.users.upsertFromSignIn(TERRY);

    const placed = await store.users.updateAddress(TERRY.id, { address: 'UBC, Vancouver', location: UBC });
    expect(placed).toMatchObject({ address: 'UBC, Vancouver', location: UBC });

    const cleared = await store.users.updateAddress(TERRY.id, null);
    expect(cleared).not.toHaveProperty('address');
    expect(cleared).not.toHaveProperty('location');

    expect(await store.users.updateAddress('unknown', { address: 'UBC, Vancouver', location: UBC })).toBeNull();
  });

  // Input: an address written directly without a location
  // Expected behavior: the validator's dependencies rule rejects the update
  // Expected output: MongoDB error 121
  test('The validator rejects an address without a location', async () => {
    await store.users.upsertFromSignIn(TERRY);

    await expect(
      db.collection(USERS_COLLECTION).updateOne({ id: TERRY.id }, { $set: { address: 'UBC, Vancouver' } }),
    ).rejects.toMatchObject({ code: VALIDATION_FAILED });
  });

  // Input: a second document written directly with an id that already exists
  // Expected behavior: the unique index on id rejects it
  // Expected output: MongoDB error 11000
  test('User ids are unique', async () => {
    await store.users.upsertFromSignIn(TERRY);

    const now = new Date();
    await expect(
      db.collection(USERS_COLLECTION).insertOne({ ...TERRY, pictureUrl: null, createdAt: now, updatedAt: now }),
    ).rejects.toMatchObject({ code: DUPLICATE_KEY });
  });
});
