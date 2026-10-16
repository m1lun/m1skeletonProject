import { normaliseKey } from '../models/common';
import { DEFAULT_OPTIONS } from '../models/option';
import type { Store } from './types';

// Inserts the built-in pick-list values that are missing; safe to run on every start.
export async function seedOptions(store: Store): Promise<void> {
  try {
    for (const [field, labels] of Object.entries(DEFAULT_OPTIONS)) {
      for (const label of labels) {
        await store.options.ensure({
          field,
          key: normaliseKey(label),
          label,
          builtin: true,
          createdBy: null,
          createdAt: new Date(),
        });
      }
    }
  } catch (error) {
    throw new Error('Failed to seed built-in options', { cause: error });
  }
}
