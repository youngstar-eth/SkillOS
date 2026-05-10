import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { stringify as yamlStringify } from './lib/yaml.js';
import { errorHandler, notFound } from './middleware/errorEnvelope.js';
import { requestId } from './middleware/requestId.js';
import { healthRoutes } from './routes/health.js';
import { scoreRoutes } from './routes/scores.js';
import { sponsorRoutes } from './routes/sponsors.js';
import { tournamentRoutes } from './routes/tournaments.js';

const app = new OpenAPIHono();

// Middleware order matters: requestId before everything so the header is set
// even on early-rejection paths; CORS next so preflights short-circuit before
// route resolution; errorHandler is registered via app.onError below.
app.use('*', requestId());
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Request-Id'],
    exposeHeaders: ['X-Request-Id'],
    maxAge: 86400,
  }),
);

app.route('/', healthRoutes);
app.route('/', tournamentRoutes);
app.route('/', scoreRoutes);
app.route('/', sponsorRoutes);

// ─── OpenAPI 3.1 spec endpoints ───────────────────────────────────────────

const openApiConfig = {
  openapi: '3.1.0' as const,
  info: {
    title: 'SkillOS API',
    version: '0.1.0',
    description:
      'Public read-only HTTP API for the SkillOS protocol. Tournaments, scores, and sponsor receipts on Base Sepolia. See https://docs.skillos.network for the full developer surface map.',
    license: { name: 'MIT' },
  },
  servers: [
    { url: 'https://api.skillos.network', description: 'Production' },
    { url: 'http://localhost:3000', description: 'Local dev' },
  ],
};

app.doc31('/openapi.json', openApiConfig);

app.get('/openapi.yaml', (c) => {
  const doc = app.getOpenAPI31Document(openApiConfig);
  return c.body(yamlStringify(doc), 200, {
    'Content-Type': 'application/yaml; charset=utf-8',
  });
});

// ─── /docs — Stoplight Elements UI (CDN-loaded, brand-themed) ─────────────

const STOPLIGHT_VERSION = '8.4.6';

const docsHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SkillOS API · Reference</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <link
      rel="stylesheet"
      href="https://unpkg.com/@stoplight/elements@${STOPLIGHT_VERSION}/styles.min.css"
    />
    <style>
      :root {
        --primary: #e4f222;
        --color-primary: #e4f222;
        --background: #08090a;
        --color-canvas: #08090a;
      }
      html, body, #root {
        margin: 0;
        height: 100%;
        background: #08090a;
        color: #f5f5f5;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      a, a:visited { color: #e4f222; }
    </style>
  </head>
  <body>
    <elements-api
      apiDescriptionUrl="/openapi.yaml"
      router="hash"
      layout="sidebar"
      tryItCredentialsPolicy="omit"
    ></elements-api>
    <script src="https://unpkg.com/@stoplight/elements@${STOPLIGHT_VERSION}/web-components.min.js"></script>
  </body>
</html>`;

app.get('/docs', (c) =>
  c.body(docsHtml, 200, { 'Content-Type': 'text/html; charset=utf-8' }),
);

// Friendly root: redirect to docs.
app.get('/', (c) => c.redirect('/docs', 302));

// 404 + error
app.notFound(notFound);
app.onError(errorHandler);

export default app;
