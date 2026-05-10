import type { MiddlewareHandler } from 'hono';

const HEADER = 'X-Request-Id';

export const requestId = (): MiddlewareHandler => async (c, next) => {
  const incoming = c.req.header(HEADER);
  const id = incoming ?? crypto.randomUUID();
  c.set('requestId', id);
  await next();
  c.header(HEADER, id);
};

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}
