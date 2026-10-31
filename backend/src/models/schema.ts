// MongoDB $jsonSchema validators: the database rejects documents that miss a
// required field, have the wrong type, or use a value outside the allowed set.
import type { Document } from 'mongodb';

import {
  CONDITIONS,
  FIELD_TYPES,
  MAX_ADDRESS_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PHOTOS,
  MAX_STARS,
  MAX_FIELDS,
  MAX_TEXT_VALUE_LENGTH,
  MIN_STARS,
  NORMALISED_PATTERN,
  PHOTO_ID,
  POST_STATUSES,
  RESERVED_KEYS,
} from './common';

// Every listed property is required unless it is named in `optional`.
function object(properties: Record<string, Document>, optional: string[] = [], rules: Document = {}): Document {
  return {
    bsonType: 'object',
    required: Object.keys(properties).filter((name) => !optional.includes(name)),
    properties,
    ...rules,
  };
}

const text = (maxLength?: number): Document => ({
  bsonType: 'string',
  minLength: 1,
  ...(maxLength === undefined ? {} : { maxLength }),
});
const label = text(MAX_LABEL_LENGTH);
const key = { ...label, pattern: NORMALISED_PATTERN };
const date = { bsonType: 'date' };

const location = object({
  type: { enum: ['Point'] },
  coordinates: {
    bsonType: 'array',
    minItems: 2,
    maxItems: 2,
    items: [
      { bsonType: 'number', minimum: -180, maximum: 180 },
      { bsonType: 'number', minimum: -90, maximum: 90 },
    ],
  },
});

const photoIds = (minItems: number): Document => ({
  bsonType: 'array',
  minItems,
  maxItems: MAX_PHOTOS,
  items: { bsonType: 'string', pattern: PHOTO_ID.source },
});

const fieldProperties = {
  key,
  label,
  kind: { enum: ['builtin', 'custom'] },
  type: { enum: [...FIELD_TYPES, 'dimensions'] },
  value: {
    anyOf: [{ bsonType: 'string', maxLength: MAX_TEXT_VALUE_LENGTH }, { bsonType: ['number', 'bool', 'object'] }],
  },
};

// A field is either built-in, or custom with a key that no built-in field uses.
const fieldRule = {
  anyOf: [
    { properties: { kind: { enum: ['builtin'] } } },
    { properties: { kind: { enum: ['custom'] }, key: { not: { enum: [...RESERVED_KEYS] } } } },
  ],
};

const fieldList = (item: Document): Document => ({ bsonType: 'array', maxItems: MAX_FIELDS, items: item });

const postProperties = {
  ownerId: text(),
  name: text(MAX_NAME_LENGTH),
  category: key,
  description: { bsonType: 'string', maxLength: MAX_DESCRIPTION_LENGTH },
  address: text(MAX_ADDRESS_LENGTH),
  location,
  status: { enum: [...POST_STATUSES] },
  createdAt: date,
  updatedAt: date,
};

export const listingSchema = object({
  ...postProperties,
  price: { bsonType: 'number', minimum: 0 },
  condition: { enum: [...CONDITIONS] },
  photoIds: photoIds(1),
  listingFields: fieldList(object(fieldProperties, [], fieldRule)),
});

// Requests may have no photos, and a hard field has no importance.
export const requestSchema = object({
  ...postProperties,
  photoIds: photoIds(0),
  requestFields: fieldList(
    object(
      { ...fieldProperties, hard: { bsonType: 'bool' }, importance: { bsonType: 'int', minimum: 1, maximum: 5 } },
      ['importance'],
      fieldRule,
    ),
  ),
});

export const optionSchema = object({
  field: label,
  key,
  label,
  builtin: { bsonType: 'bool' },
  createdBy: { bsonType: ['string', 'null'] },
  createdAt: date,
});

export const customFieldSchema = object({
  ownerId: text(),
  key,
  label,
  type: { enum: [...FIELD_TYPES] },
});

// Names may be empty: Google doesn't always send a family name.
export const userSchema = object(
  {
    id: text(),
    firstName: { bsonType: 'string' },
    lastName: { bsonType: 'string' },
    email: { bsonType: 'string' },
    pictureUrl: { bsonType: ['string', 'null'] },
    address: text(MAX_ADDRESS_LENGTH),
    location,
    createdAt: date,
    updatedAt: date,
  },
  ['address', 'location'],
  { dependencies: { address: ['location'], location: ['address'] } },
);

export const sessionSchema = object({
  tokenHash: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
  familyId: text(),
  userId: text(),
  email: { bsonType: 'string' },
  firstName: { bsonType: 'string' },
  lastName: { bsonType: 'string' },
  createdAt: date,
  expiresAt: date,
  usedAt: { bsonType: ['date', 'null'] },
});

export const dealSchema = object({
  listingId: { bsonType: ['string', 'null'] },
  requestId: { bsonType: ['string', 'null'] },
  sellerId: text(),
  buyerId: text(),
  agreedPrice: { bsonType: 'number', minimum: 0 },
  createdAt: date,
}, [], {
  // At least one of the two posts must be there.
  anyOf: [{ properties: { listingId: text() }, required: ['listingId'] }, { properties: { requestId: text() }, required: ['requestId'] }],
});

export const ratingSchema = object({
  dealId: text(),
  raterId: text(),
  ratedUserId: text(),
  stars: { bsonType: 'int', minimum: MIN_STARS, maximum: MAX_STARS },
  comment: { bsonType: 'string', maxLength: MAX_COMMENT_LENGTH },
  createdAt: date,
  updatedAt: date,
}, ['updatedAt']);

export const reputationSchema = object({
  userId: text(),
  starSum: { bsonType: 'number', minimum: 0 },
  ratingCount: { bsonType: 'number', minimum: 1 },
  updatedAt: date,
});
