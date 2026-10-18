export const MAX_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
// A post refers to a stored photo by its id.
export const PHOTO_ID = /^[0-9a-f]{24}$/;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_ADDRESS_LENGTH = 200;
export const MAX_LABEL_LENGTH = 60;
export const MAX_TEXT_VALUE_LENGTH = 100;
// Up to 6 built-in fields plus 10 custom fields.
export const MAX_FIELDS = 16;

// Keys used by built-in fields; custom fields can't take them. Already normalised.
export const RESERVED_KEYS = ['category', 'price', 'condition', 'dimensions', 'radiuskm', 'brand', 'colour'] as const;

// A normalised key: lower-case words separated by single spaces, no edge spaces.
export const NORMALISED_PATTERN = '^[^A-Z\\s]+( [^A-Z\\s]+)*$';

// Ordered best to worst. Condition is a fixed scale, not a user-extendable list.
export const CONDITIONS = ['new', 'like new', 'good', 'fair', 'poor'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const POST_STATUSES = ['open', 'closed'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const FIELD_TYPES = ['text', 'number', 'bool'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

// Centimetres.
export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

export interface GeoPoint {
  type: 'Point';
  coordinates: [longitude: number, latitude: number];
}

export type FieldValue = string | number | boolean | Dimensions;

export interface PostField {
  key: string;
  label: string;
  kind: 'builtin' | 'custom';
  type: FieldType | 'dimensions';
  value: FieldValue;
}

// importance is omitted when hard: a hard field is a must-have.
export interface RequestField extends PostField {
  hard: boolean;
  importance?: number;
}

// Indexes shared by listings and requests: radius search for the feed, plus
// category browsing and "My posts" (newest first) lookups.
export const postIndexes = [
  { key: { location: '2dsphere' } },
  { key: { status: 1, category: 1 } },
  { key: { ownerId: 1, createdAt: -1 } },
] as const;

// Lower-cases, trims and collapses whitespace so "IKEA" and " ikea " are one key.
export function normaliseKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}
