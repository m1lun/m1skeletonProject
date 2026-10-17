import { normaliseKey, type Attribute } from './common';
import type { Listing } from './listing';
import type { BuyerRequest } from './request';

export class DuplicateFieldError extends Error {}

// Brand, colour and custom text values are chosen from the saved options, so they are
// lower-cased to match the stored option.
function isOptionText(row: Attribute, key: string): boolean {
  return row.type === 'text' && (row.kind === 'custom' || key === 'brand' || key === 'colour');
}

function normaliseRows<R extends Attribute>(rows: R[]): R[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const key = normaliseKey(row.key);
    if (seen.has(key)) {
      throw new DuplicateFieldError(`Duplicate field "${key}"`);
    }
    seen.add(key);
    const value = isOptionText(row, key) && typeof row.value === 'string' ? normaliseKey(row.value) : row.value;
    return { ...row, key, label: row.label.trim(), value };
  });
}

type NewPost<T> = Omit<T, 'id'>;

// The text fields every post has.
function tidyPost<T extends { category: string; description: string; address: string }>(doc: T): T {
  return {
    ...doc,
    category: normaliseKey(doc.category),
    description: doc.description.trim(),
    address: doc.address.trim(),
  };
}

export function normaliseListing(doc: NewPost<Listing>): NewPost<Listing> {
  return { ...tidyPost(doc), attributes: normaliseRows(doc.attributes) };
}

export function normaliseRequest(doc: NewPost<BuyerRequest>): NewPost<BuyerRequest> {
  return { ...tidyPost(doc), requirements: normaliseRows(doc.requirements) };
}
