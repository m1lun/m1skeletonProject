import type { Request, RequestHandler, Response } from 'express';

// Express wants a handler that returns nothing, so this runs the async handler
// and passes any failure on to the error handler.
export function handle(run: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    run(req, res).catch((error: unknown) => {
      next(error);
    });
  };
}
