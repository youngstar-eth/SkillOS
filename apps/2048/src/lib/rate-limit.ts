// ───────────────────────────────────────────────────────────────────────────
// In-memory per-IP rate limiter for the x402 coach-sample endpoint.
//
// Sprint scope: 30 req/min per IP, sliding 60-second window. Applied
// AFTER x402 payment validates — on 429 the payment is non-refundable
// and the client is told so (documented in the response).
//
// Production note: serverless functions run per-instance so this is a
// best-effort limiter. Post-submission backlog: migrate to Upstash Redis.
// ───────────────────────────────────────────────────────────────────────────

const WINDOW_MS = 60_000;
const LIMIT = 30;

const hits = new Map<string, number[]>();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const prior = hits.get(ip) ?? [];
  const windowed = prior.filter((t) => t > cutoff);
  if (windowed.length >= LIMIT) {
    const oldest = windowed[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + WINDOW_MS - now) / 1000),
    );
    hits.set(ip, windowed);
    return { ok: false, retryAfterSeconds };
  }
  windowed.push(now);
  hits.set(ip, windowed);
  return { ok: true };
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
