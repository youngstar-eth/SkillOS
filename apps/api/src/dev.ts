// Local dev server. Run with `npm run dev` (tsx watch).
//
// Vercel doesn't use this file — the deployment entry is `api/index.ts`. Keep
// this minimal: just a Node HTTP server wrapping the same Hono app.

import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './app.js';

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`SkillOS API listening on http://localhost:${info.port}`);
  console.log(`  docs:    http://localhost:${info.port}/docs`);
  console.log(`  openapi: http://localhost:${info.port}/openapi.json`);
});
