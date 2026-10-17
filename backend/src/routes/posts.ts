import { Router, type Request, type Response } from 'express';

import { currentUser } from '../sessions';
import { BadRequestError } from '../errors';
import { MAX_PHOTOS, RESERVED_KEYS, normaliseKey, type Attribute, type GeoPoint } from '../models/common';
import type { PostDoc, PostRepo, Store } from '../store/types';
import { isNumber, isObject, isText, type Body } from './checks';
import { rememberNewValues } from './remember';

// What the server knows about a built-in field, so the client only sends its key.
// For example the key "price" on a request is { label: 'Max price', type: 'number' }.
interface BuiltinField {
  label: string;
  type: Attribute['type'];
}

// All the built-in fields of one kind of post, by key. A request has
// { price: {...}, condition: {...}, ... } and a listing has { brand, colour, dimensions }.
type Builtins = Record<string, BuiltinField>;

// Everything that differs between listings and requests. listings.ts and requests.ts
// each provide one of these, and createPostRouter builds the routes from it.
export interface PostKind<T extends PostDoc> {
  // Where the posts are saved: store.listings or store.requests.
  repo: PostRepo<T>;
  builtins: Builtins;
  // The name of the list of rows in the body: 'attributes' for a listing, 'requirements' for a request.
  rowsField: 'attributes' | 'requirements';
  // A listing needs at least 1 photo, a request needs none.
  minPhotos: number;
  // Checks what only this kind has and returns it: a listing's price and condition
  // ({ price: 100, condition: 'good' }), or nothing for a request. It also reports a
  // request that has no max price.
  parseExtra(body: Body, rows: Attribute[], errors: string[]): Body;
}

// Fields the server sets itself; a PATCH body never carries them.
const SERVER_FIELDS = ['id', 'ownerId', 'status', 'createdAt', 'updatedAt'];

function parseLocation(value: unknown, errors: string[]): GeoPoint {
  const point: GeoPoint = { type: 'Point', coordinates: [0, 0] };
  if (!isObject(value) || !isNumber(value.longitude) || !isNumber(value.latitude)) {
    errors.push('location must be { longitude, latitude }');
  } else if (Math.abs(value.longitude) > 180 || Math.abs(value.latitude) > 90) {
    errors.push('location is out of range');
  } else {
    point.coordinates = [value.longitude, value.latitude];
  }
  return point;
}

function parsePhotos(value: unknown, minPhotos: number, errors: string[]): string[] {
  if (!Array.isArray(value) || value.some((url) => typeof url !== 'string')) {
    errors.push('photoUrls must be an array of URLs');
    return [];
  }
  if (value.length < minPhotos) {
    errors.push(`at least ${minPhotos} photo is required`);
  }
  if (value.length > MAX_PHOTOS) {
    errors.push(`at most ${MAX_PHOTOS} photos are allowed`);
  }
  return value as string[];
}

// A custom row arrives as { label, type, value }; its key comes from the label.
function parseCustomRow(row: Body, rowName: string, errors: string[]): Attribute | null {
  const key = isText(row.label) ? normaliseKey(row.label) : '';
  if (key === '') {
    errors.push(`${rowName} needs a label`);
    return null;
  }
  if ((RESERVED_KEYS as readonly string[]).includes(key)) {
    errors.push(`"${String(row.label)}" is already a built-in field, so there is no need to add it as a custom field`);
    return null;
  }
  return { ...row, key } as Attribute;
}

// A built-in row arrives as { key, value }; its label and type come from the built-in fields.
function parseBuiltinRow(row: Body, builtins: Builtins, rowName: string, errors: string[]): Attribute | null {
  const key = normaliseKey(String(row.key));
  const builtin = Object.entries(builtins).find(([builtinKey]) => builtinKey === key)?.[1];
  if (builtin === undefined) {
    errors.push(`${rowName} has an unknown field "${String(row.key)}"`);
    return null;
  }
  return { ...row, kind: 'builtin', key, label: builtin.label, type: builtin.type } as Attribute;
}

function parseRows(value: unknown, builtins: Builtins, name: string, errors: string[]): Attribute[] {
  if (!Array.isArray(value) || value.some((row) => !isObject(row))) {
    errors.push(`${name} must be an array`);
    return [];
  }
  const rows: Attribute[] = [];
  (value as Body[]).forEach((row, index) => {
    // For example "attributes[2]", so a message says which row has the problem.
    const rowName = `${name}[${index}]`;
    const parsed =
      row.kind === 'custom' ? parseCustomRow(row, rowName, errors) : parseBuiltinRow(row, builtins, rowName, errors);
    if (parsed !== null) {
      rows.push(parsed);
    }
  });
  return rows;
}

// What a request body turns into after parsing. For a listing it looks like:
//   fields:   { category: 'Furniture', address: '...', location: {...}, photoUrls: [...],
//               attributes: [...], price: 100, condition: 'good' }   (everything that is saved)
//   category: 'Furniture'                                          (also inside fields)
//   rows:     [ { kind: 'builtin', key: 'brand', value: 'ikea', ... } ]   (the same list as fields.attributes)
// category and rows are copies, kept separate so later steps can use them with proper types.
interface ParsedPost {
  fields: Body;
  category: string;
  rows: Attribute[];
}

// Checks the common mistakes with clear messages; the database schema checks the rest.
function parsePost<T extends PostDoc>(kind: PostKind<T>, body: unknown): ParsedPost {
  if (!isObject(body)) {
    throw new BadRequestError(['request body must be a JSON object']);
  }
  const errors: string[] = [];
  if (!isText(body.category)) {
    errors.push('category is required');
  }
  if (!isText(body.address)) {
    errors.push('address is required');
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    errors.push('description must be a string');
  }
  const rows = parseRows(body[kind.rowsField], kind.builtins, kind.rowsField, errors);
  const fields: Body = {
    category: body.category,
    address: body.address,
    description: body.description ?? '',
    location: parseLocation(body.location, errors),
    photoUrls: parsePhotos(body.photoUrls ?? [], kind.minPhotos, errors),
    [kind.rowsField]: rows,
    ...kind.parseExtra(body, rows, errors),
  };
  if (errors.length > 0) {
    throw new BadRequestError(errors);
  }
  return { fields, category: String(body.category), rows };
}

// The body a client sends for a stored post, so a PATCH can merge changes over it.
function toBody(post: PostDoc): Body {
  const body = Object.fromEntries(Object.entries(post).filter(([name]) => !SERVER_FIELDS.includes(name)));
  return {
    ...body,
    location: { longitude: post.location.coordinates[0], latitude: post.location.coordinates[1] },
  };
}

export function createPostRouter<T extends PostDoc>(store: Store, kind: PostKind<T>): Router {
  const router = Router();

  async function loadOwned(req: Request, res: Response): Promise<T | null> {
    const post = await kind.repo.findById(String(req.params.id));
    if (post === null) {
      res.status(404).json({ error: 'Not Found' });
      return null;
    }
    if (post.ownerId !== currentUser(res).id) {
      res.status(403).json({ error: 'Forbidden' });
      return null;
    }
    return post;
  }

  router.post('/', async (req, res) => {
    const ownerId = currentUser(res).id;
    const { fields, category, rows } = parsePost(kind, req.body);
    const now = new Date();
    const created = await kind.repo.insert({
      ...fields,
      ownerId,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    } as unknown as Omit<T, 'id'>);
    await rememberNewValues(store, ownerId, category, rows);
    res.status(201).json(created);
  });

  router.get('/', async (req, res) => {
    res.json(await kind.repo.listByOwner(currentUser(res).id));
  });

  router.get('/:id', async (req, res) => {
    const post = await loadOwned(req, res);
    if (post !== null) {
      res.json(post);
    }
  });

  router.patch('/:id', async (req, res) => {
    const post = await loadOwned(req, res);
    if (post === null) {
      return;
    }
    if (!isObject(req.body)) {
      throw new BadRequestError(['request body must be a JSON object']);
    }
    const { status = post.status, ...changes } = req.body;
    if (status !== 'open' && status !== 'closed') {
      throw new BadRequestError(['status must be "open" or "closed"']);
    }
    const { fields, category, rows } = parsePost(kind, { ...toBody(post), ...changes });
    const updated = await kind.repo.replace({ ...post, ...fields, status, updatedAt: new Date() } as T);
    await rememberNewValues(store, post.ownerId, category, rows);
    res.json(updated);
  });

  router.delete('/:id', async (req, res) => {
    const post = await loadOwned(req, res);
    if (post !== null) {
      await kind.repo.remove(post.id);
      res.status(204).end();
    }
  });

  return router;
}
