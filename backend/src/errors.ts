import type { ErrorRequestHandler } from 'express';

import { DuplicateFieldError } from './models/normalise';

// A request the client can fix; the details are shown to the user.
export class BadRequestError extends Error {
  constructor(public readonly details: string[]) {
    super(details.join('; '));
  }
}

// MongoDB's code for a document that fails the collection's $jsonSchema.
const DOCUMENT_VALIDATION_FAILED = 121;

// Express only treats a function with four parameters as an error handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof BadRequestError) {
    res.status(400).json({ error: 'Invalid request', details: error.details });
    return;
  }
  if (error instanceof DuplicateFieldError) {
    res.status(400).json({ error: 'Invalid request', details: [error.message] });
    return;
  }
  const { status, code } = error as { status?: number; code?: number };
  if (status === 400) {
    res.status(400).json({ error: 'Malformed request body' });
    return;
  }
  if (code === DOCUMENT_VALIDATION_FAILED) {
    res.status(400).json({ error: 'Invalid request', details: ['a field is outside its allowed values or length'] });
    return;
  }
  console.error('Unhandled error', error);
  res.status(500).json({ error: 'Internal Server Error' });
};
