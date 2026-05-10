import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import type { ErrorEnvelope } from '../schemas/common.js';

export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 404 | 422 | 502,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const envelope = (
  code: string,
  message: string,
  details?: unknown,
): ErrorEnvelope => ({ error: { code, message, ...(details !== undefined && { details }) } });

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ApiError) {
    return c.json(envelope(err.code, err.message, err.details), err.status);
  }
  if (err instanceof ZodError) {
    return c.json(envelope('INVALID_PARAMS', 'Request validation failed', err.issues), 422);
  }
  if (err instanceof HTTPException) {
    return c.json(envelope('HTTP_ERROR', err.message), err.status);
  }
  // Genuine unhandled — log and return generic envelope.
  // Vercel captures stderr automatically; no need for a logging dep.
  console.error('[unhandled]', err);
  return c.json(envelope('INTERNAL', 'An unexpected error occurred'), 500);
};

// Catch-all for routes that don't match any registered path.
export const notFound: NotFoundHandler = (c) =>
  c.json(envelope('NOT_FOUND', `No route for ${c.req.method} ${c.req.path}`), 404);
