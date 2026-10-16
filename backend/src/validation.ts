import {
  CONDITIONS,
  FIELD_TYPES,
  MAX_CUSTOM_FIELDS,
  MAX_DESCRIPTION_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_PHOTOS,
  MAX_TEXT_VALUE_LENGTH,
  normaliseKey,
  type Attribute,
  type AttributeValue,
  type Condition,
  type Dimensions,
  type FieldType,
  type GeoPoint,
  type Requirement,
} from './models/common';

export class ValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(details.join('; '));
  }
}

type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, name: string, max: number, errors: string[]): string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${name} is required`);
    return '';
  }
  if (value.trim().length > max) {
    errors.push(`${name} must be at most ${max} characters`);
  }
  return value.trim();
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseDescription(value: unknown, errors: string[]): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    errors.push('description must be a string');
    return '';
  }
  if (value.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  return value.trim();
}

export function parseAddress(value: unknown, errors: string[]): string {
  return str(value, 'address', 200, errors);
}

export function parseLocation(value: unknown, errors: string[]): GeoPoint {
  const fallback: GeoPoint = { type: 'Point', coordinates: [0, 0] };
  if (!isObject(value) || !finite(value.longitude) || !finite(value.latitude)) {
    errors.push('location must be { longitude, latitude }');
    return fallback;
  }
  if (Math.abs(value.longitude) > 180 || Math.abs(value.latitude) > 90) {
    errors.push('location is out of range');
    return fallback;
  }
  return { type: 'Point', coordinates: [value.longitude, value.latitude] };
}

export function parsePhotoUrls(value: unknown, min: number, errors: string[]): string[] {
  if (value === undefined || value === null) {
    value = [];
  }
  if (!Array.isArray(value) || value.some((u) => typeof u !== 'string' || !/^https?:\/\//.test(u))) {
    errors.push('photoUrls must be an array of http(s) URLs');
    return [];
  }
  if (value.length > MAX_PHOTOS) {
    errors.push(`at most ${MAX_PHOTOS} photos are allowed`);
  }
  if (value.length < min) {
    errors.push(`at least ${min} photo is required`);
  }
  return value as string[];
}

export function parseCategory(value: unknown, errors: string[]): string {
  return normaliseKey(str(value, 'category', MAX_LABEL_LENGTH, errors));
}

export function parsePrice(value: unknown, name: string, errors: string[]): number {
  if (!finite(value) || value < 0) {
    errors.push(`${name} must be a number of at least 0`);
    return 0;
  }
  return value;
}

export function parseCondition(value: unknown, name: string, errors: string[]): Condition {
  if (typeof value !== 'string' || !(CONDITIONS as readonly string[]).includes(value)) {
    errors.push(`${name} must be one of: ${CONDITIONS.join(', ')}`);
    return 'good';
  }
  return value as Condition;
}

function parseDimensions(value: unknown, name: string, errors: string[]): Dimensions {
  const zero = { width: 0, height: 0, depth: 0 };
  if (!isObject(value)) {
    errors.push(`${name} must be { width, height, depth }`);
    return zero;
  }
  const { width, height, depth } = value;
  if (![width, height, depth].every((n) => finite(n) && n > 0)) {
    errors.push(`${name} width, height and depth must be numbers above 0`);
    return zero;
  }
  return { width, height, depth } as Dimensions;
}

// Values for the open pick-list fields (brand, colour, and custom text fields).
export interface OptionUse {
  field: string;
  key: string;
  label: string;
  // Custom text values are added to the list on save; brand and colour must
  // already exist (the client adds them first via POST /options).
  autoAdd: boolean;
}

export interface ParsedAttributes {
  items: (Attribute | Requirement)[];
  optionUses: OptionUse[];
  customDefs: { key: string; label: string; type: FieldType }[];
}

const RESERVED_KEYS = new Set(['category', 'price', 'condition', 'dimensions', 'radiusKm', 'brand', 'colour']);

interface BuiltinSpec {
  label: string;
  type: Attribute['type'];
}

// Each item in `rows` is one requirement (buyer) or attribute (seller).
export function parseRows(
  rows: unknown,
  builtins: Record<string, BuiltinSpec>,
  mode: 'requirement' | 'attribute',
  errors: string[],
): ParsedAttributes {
  const result: ParsedAttributes = { items: [], optionUses: [], customDefs: [] };
  if (rows === undefined || rows === null) {
    return result;
  }
  if (!Array.isArray(rows)) {
    errors.push(`${mode === 'requirement' ? 'requirements' : 'attributes'} must be an array`);
    return result;
  }
  const seen = new Set<string>();
  let customCount = 0;

  rows.forEach((row, index) => {
    const at = `${mode === 'requirement' ? 'requirements' : 'attributes'}[${index}]`;
    if (!isObject(row)) {
      errors.push(`${at} must be an object`);
      return;
    }
    const before = errors.length;
    const isCustom = row.kind === 'custom';
    let key: string;
    let label: string;
    let type: Attribute['type'];

    if (isCustom) {
      label = str(row.label, `${at}.label`, MAX_LABEL_LENGTH, errors);
      key = normaliseKey(label);
      if (RESERVED_KEYS.has(key)) {
        errors.push(`${at}.label "${label}" is reserved`);
      }
      if (typeof row.type !== 'string' || !(FIELD_TYPES as readonly string[]).includes(row.type)) {
        errors.push(`${at}.type must be one of: ${FIELD_TYPES.join(', ')}`);
        type = 'text';
      } else {
        type = row.type as FieldType;
      }
      customCount += 1;
      if (customCount > MAX_CUSTOM_FIELDS) {
        errors.push(`at most ${MAX_CUSTOM_FIELDS} custom fields are allowed`);
      }
    } else {
      key = typeof row.key === 'string' ? row.key : '';
      const spec = Object.entries(builtins).find(([name]) => name === key)?.[1];
      if (spec === undefined) {
        errors.push(`${at}.key "${key}" is not a known field`);
        return;
      }
      label = spec.label;
      type = spec.type;
    }

    if (seen.has(key)) {
      errors.push(`${at} duplicates field "${key}"`);
      return;
    }
    seen.add(key);

    let value: AttributeValue;
    if (type === 'dimensions') {
      value = parseDimensions(row.value, `${at}.value`, errors);
    } else if (type === 'number') {
      if (!finite(row.value) || (!isCustom && key === 'radiusKm' && row.value <= 0)) {
        errors.push(`${at}.value must be a number${key === 'radiusKm' ? ' above 0' : ''}`);
      }
      value = finite(row.value) ? row.value : 0;
    } else if (type === 'bool') {
      if (typeof row.value !== 'boolean') {
        errors.push(`${at}.value must be true or false`);
      }
      value = row.value === true;
    } else {
      if (key === 'condition' && !isCustom) {
        value = parseCondition(row.value, `${at}.value`, errors);
      } else {
        const text = str(row.value, `${at}.value`, MAX_TEXT_VALUE_LENGTH, errors);
        value = key === 'brand' || key === 'colour' || isCustom ? normaliseKey(text) : text;
      }
    }

    if (isCustom) {
      result.customDefs.push({ key, label, type: type as FieldType });
    }
    if (type === 'text' && (isCustom || key === 'brand' || key === 'colour') && typeof value === 'string' && value !== '') {
      result.optionUses.push({ field: key, key: value, label: value, autoAdd: isCustom });
    }

    const base: Attribute = {
      key,
      label,
      kind: isCustom ? 'custom' : 'builtin',
      type,
      value,
    };

    if (mode === 'attribute') {
      result.items.push(base);
      return;
    }

    const hard = row.hard === true;
    if (row.hard !== undefined && typeof row.hard !== 'boolean') {
      errors.push(`${at}.hard must be true or false`);
    }
    const requirement: Requirement = { ...base, hard };
    if (!hard) {
      const importance = row.importance === undefined ? 3 : row.importance;
      if (!Number.isInteger(importance) || (importance as number) < 1 || (importance as number) > 5) {
        errors.push(`${at}.importance must be an integer from 1 to 5`);
      } else {
        requirement.importance = importance as number;
      }
    }
    if (errors.length === before) {
      result.items.push(requirement);
    }
  });

  return result;
}

export const REQUIREMENT_BUILTINS: Record<string, BuiltinSpec> = {
  price: { label: 'Max price', type: 'number' },
  condition: { label: 'Min condition', type: 'text' },
  dimensions: { label: 'Max size', type: 'dimensions' },
  radiusKm: { label: 'Radius (km)', type: 'number' },
  brand: { label: 'Brand', type: 'text' },
  colour: { label: 'Colour', type: 'text' },
};

export const ATTRIBUTE_BUILTINS: Record<string, BuiltinSpec> = {
  brand: { label: 'Brand', type: 'text' },
  colour: { label: 'Colour', type: 'text' },
  dimensions: { label: 'Size', type: 'dimensions' },
};

export function parseStatus(value: unknown, errors: string[]): 'open' | 'closed' {
  if (value !== 'open' && value !== 'closed') {
    errors.push('status must be "open" or "closed"');
    return 'open';
  }
  return value;
}
