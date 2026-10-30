import { randomUUID } from 'node:crypto';
import os from 'node:os';

import { MongoClient, type Db, type MongoClientOptions } from 'mongodb';

import { createMongoStore } from '../../src/store/mongoStore';
import type { Store } from '../../src/store/types';

// CI sets TEST_MONGODB_URI. Locally, scripts/run-backend-interface-tests.* starts a throwaway
// MongoDB from docker-compose.test.yml on this port.
const TEST_MONGODB_URI: string = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27018';
const REACH_TIMEOUT_MS = 3000;

// The driver loads `os` with a dynamic import(), which Jest cannot run. It then sends MongoDB an
// empty client description and the server refuses the handshake ("Missing required sub-document
// 'driver'"). Handing the driver the module itself avoids the import.
const CLIENT_OPTIONS: MongoClientOptions = { runtimeAdapters: { os } };

export interface TestStore {
  store: Store;
  // The same database the store writes to, for checking what really was stored.
  db: Db;
  // Drops the test database and closes both connections.
  dropAndClose: () => Promise<void>;
}

// A real store on a database of its own, with the app's schemas and indexes applied, so
// every test file starts from nothing and never touches the developer's data.
export async function createTestStore(): Promise<TestStore> {
  const client = new MongoClient(TEST_MONGODB_URI, { ...CLIENT_OPTIONS, serverSelectionTimeoutMS: REACH_TIMEOUT_MS });
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
  } catch (cause) {
    await client.close();
    throw new Error(
      `MongoDB is not reachable at ${TEST_MONGODB_URI}. Run the tests with ` +
        'scripts/run-backend-interface-tests.sh, or start one with: ' +
        'docker compose -f docker-compose.test.yml up -d --wait',
      { cause }
    );
  }

  const dbName = `matchmarket_test_${randomUUID().replaceAll('-', '')}`;
  const store = await createMongoStore(TEST_MONGODB_URI, dbName, CLIENT_OPTIONS);
  return {
    store,
    db: client.db(dbName),
    dropAndClose: async () => {
      await store.close();
      await client.db(dbName).dropDatabase();
      await client.close();
    },
  };
}
