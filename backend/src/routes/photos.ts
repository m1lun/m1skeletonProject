import express, { Router, type Request, type Response } from 'express';
import { pipeline } from 'node:stream/promises';

import { MAX_PHOTOS, MAX_PHOTO_BYTES } from '../models/common';
import { parseMultipart } from '../photos/multipart';
import { PHOTO_TYPES, type PhotoStorage } from '../photos/storage';
import { currentUser, requireAuth } from '../sessions';
import { handle } from './handle';

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export function createPhotosRouter(photos: PhotoStorage): Router {
  const router = Router();

  // Public, so the app's image loader can fetch a photo without a token.
  router.get(
    '/:id',
    handle(async (req: Request, res: Response) => {
      const photo = await photos.open(String(req.params.id));
      if (photo === null) {
        res.status(404).json({ error: 'Photo not found' });
        return;
      }
      res.set({ 'Content-Type': photo.mimeType, 'Cache-Control': 'public, max-age=31536000, immutable' });
      await pipeline(photo.stream, res);
    }),
  );

  // Up to MAX_PHOTOS images in the "photos" field of one multipart/form-data request.
  router.post(
    '/',
    requireAuth,
    express.raw({ type: 'multipart/form-data', limit: MAX_PHOTOS * MAX_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES }),
    handle(async (req: Request, res: Response) => {
      const body = req.body as unknown;
      const parts = Buffer.isBuffer(body) ? parseMultipart(body, String(req.get('content-type') ?? '')) : undefined;
      const files = parts?.filter((p) => p.field === 'photos') ?? [];
      if (files.length === 0 || files.some((f) => !PHOTO_TYPES.includes(f.mimeType) || f.data.length === 0)) {
        res.status(400).json({ error: 'Attach images (jpeg, png, webp or gif) in the "photos" field' });
        return;
      }
      if (files.length > MAX_PHOTOS) {
        res.status(400).json({ error: `At most ${MAX_PHOTOS} photos are allowed` });
        return;
      }
      if (files.some((f) => f.data.length > MAX_PHOTO_BYTES)) {
        res.status(413).json({ error: `Each photo must be at most ${MAX_PHOTO_BYTES / (1024 * 1024)} MB` });
        return;
      }
      const ownerId = currentUser(res).id;
      const ids = await Promise.all(files.map((f) => photos.save(f.data, f.mimeType, ownerId)));
      res.status(201).json({ ids });
    }),
  );

  return router;
}
