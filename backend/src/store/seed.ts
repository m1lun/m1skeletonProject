import { normaliseKey } from '../models/common';
import { DEFAULT_OPTIONS } from '../models/option';
import type { Store } from './types';

// Inserts the built-in pick-list values that are missing, in one round trip;
// safe to run on every start.
export async function seedOptions(store: Store): Promise<void> {
  const createdAt = new Date();
  const options = Object.entries(DEFAULT_OPTIONS).flatMap(([field, labels]) =>
    labels.map((label) => ({
      field,
      key: normaliseKey(label),
      label,
      builtin: true,
      createdBy: null,
      createdAt,
    })),
  );
  try {
    await store.options.ensureMany(options);
  } catch (error) {
    throw new Error('Failed to seed built-in options', { cause: error });
  }
}
