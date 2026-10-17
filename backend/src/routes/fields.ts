import { Router } from 'express';

import { currentUser } from '../sessions';
import { BadRequestError } from '../errors';
import { FIELD_TYPES, MAX_LABEL_LENGTH, RESERVED_KEYS, normaliseKey } from '../models/common';
import type { Store } from '../store/types';
import { isObject, isText } from './checks';

export function createFieldsRouter(store: Store): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await store.fields.list(currentUser(res).id));
  });

  router.post('/', async (req, res) => {
    const body = isObject(req.body) ? req.body : {};
    const errors: string[] = [];
    const label = isText(body.label) ? body.label.trim() : '';
    const key = normaliseKey(label);
    if (label === '' || label.length > MAX_LABEL_LENGTH) {
      errors.push(`label must be 1 to ${MAX_LABEL_LENGTH} characters`);
    } else if ((RESERVED_KEYS as readonly string[]).includes(key)) {
      errors.push(`"${label}" is already a built-in field, so there is no need to add it`);
    }
    const type = FIELD_TYPES.find((fieldType) => fieldType === body.type);
    if (type === undefined) {
      errors.push(`type must be one of: ${FIELD_TYPES.join(', ')}`);
    }
    if (errors.length > 0 || type === undefined) {
      throw new BadRequestError(errors);
    }
    res.status(201).json(await store.fields.upsert({ ownerId: currentUser(res).id, key, label, type }));
  });

  router.delete('/:key', async (req, res) => {
    const removed = await store.fields.remove(currentUser(res).id, normaliseKey(String(req.params.key)));
    if (!removed) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    res.status(204).end();
  });

  return router;
}
