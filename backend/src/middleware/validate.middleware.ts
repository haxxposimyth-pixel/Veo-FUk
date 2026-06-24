import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Returns a middleware that validates the request body against a Zod schema.
 * Throws a ZodError if validation fails, which is caught by errorMiddleware.
 */
export function validateBody(schema: z.ZodSchema<any>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body);
    next();
  };
}
