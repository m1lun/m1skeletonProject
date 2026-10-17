import type { Router } from 'express';

import { CONDITIONS } from '../models/common';
import type { BuyerRequest } from '../models/request';
import type { Store } from '../store/types';
import { createPostRouter } from './posts';

export function createRequestsRouter(store: Store): Router {
  return createPostRouter<BuyerRequest>(store, {
    repo: store.requests,
    builtins: {
      price: { label: 'Max price', type: 'number' },
      condition: { label: 'Min condition', type: 'text' },
      dimensions: { label: 'Max size', type: 'dimensions' },
      radiuskm: { label: 'Radius (km)', type: 'number' },
      brand: { label: 'Brand', type: 'text' },
      colour: { label: 'Colour', type: 'text' },
    },
    rowsField: 'requirements',
    minPhotos: 0,
    parseExtra(_body, rows, errors) {
      if (!rows.some((row) => row.kind === 'builtin' && row.key === 'price')) {
        errors.push('a price requirement (max price) is required');
      }
      const condition = rows.find((row) => row.kind === 'builtin' && row.key === 'condition');
      if (
        condition !== undefined &&
        (typeof condition.value !== 'string' || !(CONDITIONS as readonly string[]).includes(condition.value))
      ) {
        errors.push(`min condition must be one of: ${CONDITIONS.join(', ')}`);
      }
      return {};
    },
  });
}
