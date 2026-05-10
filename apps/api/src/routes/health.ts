import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { ErrorEnvelopeSchema, HealthSchema } from '../schemas/common.js';

const startedAt = Date.now();

export const healthRoutes = new OpenAPIHono();

const route = createRoute({
  method: 'get',
  path: '/v1/health',
  summary: 'Liveness probe',
  description:
    'Returns API version, deployed commit, process uptime, and chain identity. Always 200 unless the function fails to start.',
  tags: ['meta'],
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: HealthSchema } },
    },
    500: {
      description: 'Unexpected error',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

healthRoutes.openapi(route, (c) =>
  c.json(
    {
      version: process.env.API_VERSION ?? '0.1.0',
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      network: 'base-sepolia' as const,
      chainId: 84532 as const,
    },
    200,
  ),
);
