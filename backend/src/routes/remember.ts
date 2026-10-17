import { FIELD_TYPES, normaliseKey, type Attribute, type FieldType } from '../models/common';
import type { Option } from '../models/option';
import type { Store } from '../store/types';

// Brand and colour values are suggested from the saved options.
const OPTION_FIELDS = ['brand', 'colour'];

// An option created from a value a user typed, so it is offered to everyone next time.
export function newOption(field: string, text: string, ownerId: string): Option {
  const label = text.trim().replace(/\s+/g, ' ');
  return {
    field: normaliseKey(field),
    key: normaliseKey(label),
    label,
    builtin: false,
    createdBy: ownerId,
    createdAt: new Date(),
  };
}

function textValue(row: Attribute): string | null {
  return row.type === 'text' && typeof row.value === 'string' && row.value.trim() !== '' ? row.value : null;
}

// After a post is saved, remembers the new values it used so they are offered next time:
// its category, any brand or colour, the text values of custom fields, and the custom
// fields themselves. Values that are already saved are left as they are.
export async function rememberNewValues(
  store: Store,
  ownerId: string,
  category: string,
  rows: Attribute[],
): Promise<void> {
  const saves: Promise<unknown>[] = [store.options.ensure(newOption('category', category, ownerId))];
  for (const row of rows) {
    const key = normaliseKey(row.key);
    const value = textValue(row);
    if (row.kind === 'custom' && (FIELD_TYPES as readonly string[]).includes(row.type)) {
      saves.push(store.fields.upsert({ ownerId, key, label: row.label.trim(), type: row.type as FieldType }));
    }
    if (value !== null && (row.kind === 'custom' || OPTION_FIELDS.includes(key))) {
      saves.push(store.options.ensure(newOption(key, value, ownerId)));
    }
  }
  await Promise.all(saves);
}
