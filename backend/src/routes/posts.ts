import { Router, type Request, type Response } from 'express';

import { currentUser } from '../sessions';
import { BadRequestError } from '../errors';
import { MAX_PHOTOS, RESERVED_KEYS, normaliseKey, type Attribute, type GeoPoint } from '../models/common';
import type { PostDoc, PostRepo, Store } from '../store/types';
import { isNumber, isObject, isText, type Body } from './checks';
import { handle } from './handle';
import { rememberNewValues } from './remember';

// What parsePost returns. The rows are saved under `attributes` (listing) or `requirements`
// (request). `extra` is the price and condition of a listing
//
// A listing:  { category: 'Furniture', address: '6335 Thunderbird Cres', description: '', location: {...},
//               photoUrls: ['https://...'], rows: [{ kind: 'builtin', key: 'brand', value: 'ikea', ... }],
//               extra: { price: 10, condition: 'new' } }
//
// A request:  { category: 'Furniture', address: '6335 Thunderbird Cres', description: '', location: {...},
//               photoUrls: [], rows: [{ kind: 'builtin', key: 'price', value: 120, hard: true, ... }],
//               extra: {} }
interface ParsedPost {
  category: string;
  address: string;
  description: string;
  location: GeoPoint;
  photoUrls: string[];
  rows: Attribute[];
  extra: Body;
}

interface BuiltinField {
  label: string;
  type: Attribute['type'];
}

type Builtins = Record<string, BuiltinField>;

export interface PostKind<T extends PostDoc> {
  repo: PostRepo<T>;
  builtins: Builtins;
  rowsField: 'attributes' | 'requirements';
  minPhotos: number;
  parseExtra(body: Body, rows: Attribute[], errors: string[]): Body;
}

// Set by the server; never taken from a PATCH body.
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

// A custom row arrives as { label, type, value }; the key comes from the label.
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

// A built-in row arrives as { key, value }; the label and type come from the built-ins.
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
    // For example "attributes[2]", so an error says which row is wrong.
    const rowName = `${name}[${index}]`;
    const parsed =
      row.kind === 'custom' ? parseCustomRow(row, rowName, errors) : parseBuiltinRow(row, builtins, rowName, errors);
    if (parsed !== null) {
      rows.push(parsed);
    }
  });
  return rows;
}

// Checks the common mistakes with clear messages; the schema checks the rest.
//
// CREATE:  request body ──parsePost──▶ ParsedPost ──toPost──▶ post to save
// PATCH:    stored post ──toBody──▶ body, with the changes merged in ──parsePost──▶ ParsedPost ──toPost──▶ post to save
function parsePost<T extends PostDoc>(kind: PostKind<T>, body: unknown): ParsedPost {
  if (!isObject(body)) {
    throw new BadRequestError(['request body must be a JSON object']);
  }
  const errors: string[] = [];
  const category = isText(body.category) ? body.category : '';
  if (category === '') {
    errors.push('category is required');
  }
  const address = isText(body.address) ? body.address : '';
  if (address === '') {
    errors.push('address is required');
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    errors.push('description must be a string');
  }
  const description = typeof body.description === 'string' ? body.description : '';
  const location = parseLocation(body.location, errors);
  const photoUrls = parsePhotos(body.photoUrls ?? [], kind.minPhotos, errors);
  const rows = parseRows(body[kind.rowsField], kind.builtins, kind.rowsField, errors);
  const extra = kind.parseExtra(body, rows, errors);
  if (errors.length > 0) {
    throw new BadRequestError(errors);
  }
  return { category, address, description, location, photoUrls, rows, extra };
}

// The post to save.
function toPost<T extends PostDoc>(kind: PostKind<T>, parsed: ParsedPost): Body {
  const { rows, extra, ...common } = parsed;
  return { ...common, ...extra, [kind.rowsField]: rows };
}

// A stored post as a client would send it, so a PATCH can merge changes over it.
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

  router.post('/', handle(async (req, res) => {
    const ownerId = currentUser(res).id;
    const parsed = parsePost(kind, req.body);
    const now = new Date();
    const created = await kind.repo.insert({
      ...toPost(kind, parsed),
      ownerId,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    } as unknown as Omit<T, 'id'>);
    await rememberNewValues(store, ownerId, parsed.category, parsed.rows);
    res.status(201).json(created);
  }));

  router.get('/', handle(async (req, res) => {
    res.json(await kind.repo.listByOwner(currentUser(res).id));
  }));

  router.get('/:id', handle(async (req, res) => {
    const post = await loadOwned(req, res);
    if (post !== null) {
      res.json(post);
    }
  }));

  router.patch('/:id', handle(async (req, res) => {
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
    const parsed = parsePost(kind, { ...toBody(post), ...changes });
    const updated = await kind.repo.replace({ ...post, ...toPost(kind, parsed), status, updatedAt: new Date() } as T);
    await rememberNewValues(store, post.ownerId, parsed.category, parsed.rows);
    res.json(updated);
  }));

  router.delete('/:id', handle(async (req, res) => {
    const post = await loadOwned(req, res);
    if (post !== null) {
      await kind.repo.remove(post.id);
      res.status(204).end();
    }
  }));

  return router;
}
