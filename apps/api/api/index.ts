// Vercel Node function entry point. Vercel's Node runtime hands us a
// Node-style request, not a Web Fetch `Request` — Hono ships an adapter for
// exactly this conversion. Without it, `c.req.header(...)` blows up on
// `this.raw.headers.get is not a function` because the raw request's headers
// are a plain object, not a `Headers` instance.
//
// All routing is internal to the Hono app; vercel.json rewrites every path
// to /api so this file is the single function entrypoint.

import { handle } from 'hono/vercel';
import app from '../src/app.js';

export const GET = handle(app);
export const POST = handle(app);
export const OPTIONS = handle(app);
