export const MAX_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_CUSTOM_FIELDS = 10;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_LABEL_LENGTH = 60;
export const MAX_TEXT_VALUE_LENGTH = 100;

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

export type AttributeValue = string | number | boolean | Dimensions;

export interface Attribute {
  key: string;
  label: string;
  kind: 'builtin' | 'custom';
  type: FieldType | 'dimensions';
  value: AttributeValue;
}

// importance is omitted when hard: a hard requirement is a must-have.
export interface Requirement extends Attribute {
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
