// ───────────────────────────────────────────────────────────────────────────
// Singleton x402 resource server wired to the Coinbase CDP facilitator on
// Base Sepolia. Consumed by middleware (verify + settle) and by route
// handlers (nothing direct — middleware handles the whole lifecycle in
// Next 14). Kept in its own module so lazy init happens exactly once per
// worker.
//
// Why this lives here and not inside the @x402/next paymentProxy:
// apps/2048 runs Next 14.2.35, and @x402/next requires Next 16 (uses
// `unstable_after` for post-response settlement). We hand-rolled a thin
// Next 14 middleware on top of x402HTTPResourceServer — the underlying
// resource server is framework-agnostic.
// ───────────────────────────────────────────────────────────────────────────

import { createFacilitatorConfig } from "@coinbase/x402";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { x402ResourceServer } from "@x402/core/server";
import { x402HTTPResourceServer, type RoutesConfig } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const NETWORK = (process.env.X402_NETWORK ?? "eip155:84532") as "eip155:84532";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[x402] missing required env: ${name}`);
  return value;
}

function buildRoutes(payTo: string): RoutesConfig {
  const baseDataTags = [
    "skill-gaming",
    "training-data",
    "ai-training",
    "human-decision-data",
  ];
  const decisionSampleTags = [
    "skill-gaming",
    "decision-trace",
    "training-data",
    "ai-training",
    "verified-human",
    "tier-filtered",
  ];
  const coachTags = [
    "gaming-ai",
    "coaching",
    "claude-haiku",
    "skill-gaming",
    "player-analysis",
  ];

  // Aggregate endpoint — $0.01 per call, anonymized tier histogram.
  const spTierDistribution = {
    accepts: {
      scheme: "exact",
      price: "$0.01",
      network: NETWORK,
      payTo,
    },
    description:
      "Aggregate tier histogram across 6 Skillbase games. Anonymized. Counts verified human decisions.",
    mimeType: "application/json",
    extensions: {
      bazaar: {
        discoverable: true,
        category: "gaming-data",
        tags: ["skill-gaming", "aggregate", ...baseDataTags],
      },
    },
  };

  // Decision sample — 4 tier-priced variants. Same schema, different
  // filter + price per route.
  const decisionSample = (price: string) => ({
    accepts: {
      scheme: "exact",
      price,
      network: NETWORK,
      payTo,
    },
    description:
      "Single verified decision sample from a Skillbase run. Anonymized via sha256(run_id). Schema v1 — match-level fields only (score, duration, plausibility).",
    mimeType: "application/json",
    extensions: {
      bazaar: {
        discoverable: true,
        category: "gaming-data",
        tags: decisionSampleTags,
      },
    },
  });

  const coachSample = {
    accepts: {
      scheme: "exact",
      price: "$0.05",
      network: NETWORK,
      payTo,
    },
    description:
      "AI Coach inference — per-game tactical feedback (2 areas + 1 actionable tip). Claude Haiku via Skillbase Coach pipeline. Rate-limited 30 req/min per IP.",
    mimeType: "application/json",
    extensions: {
      bazaar: {
        discoverable: true,
        category: "ai-inference",
        tags: coachTags,
      },
    },
  };

  return {
    "GET /api/public/data/sp-tier-distribution": spTierDistribution,
    "GET /api/public/data/decision-sample/any": decisionSample("$0.01"),
    "GET /api/public/data/decision-sample/tier/1-4": decisionSample("$0.02"),
    "GET /api/public/data/decision-sample/tier/5-7": decisionSample("$0.05"),
    "GET /api/public/data/decision-sample/tier/8-plus": decisionSample("$0.10"),
    "GET /api/public/ai/coach-sample": coachSample,
  };
}

let serverPromise: Promise<x402HTTPResourceServer> | null = null;

export function getX402Server(): Promise<x402HTTPResourceServer> {
  if (serverPromise) return serverPromise;
  serverPromise = (async () => {
    const apiKeyId = requireEnv("CDP_API_KEY_ID");
    const apiKeySecret = requireEnv("CDP_API_KEY_SECRET");
    const payTo = requireEnv("X402_PAY_TO");

    const cfg = createFacilitatorConfig(apiKeyId, apiKeySecret);
    const url = process.env.X402_FACILITATOR_URL ?? cfg.url;
    if (url) cfg.url = url;

    const facilitator = new HTTPFacilitatorClient(cfg);
    const resource = new x402ResourceServer(facilitator).register(
      NETWORK,
      new ExactEvmScheme(),
    );
    const http = new x402HTTPResourceServer(resource, buildRoutes(payTo));
    await http.initialize();
    return http;
  })().catch((err) => {
    // Reset so the next request retries init. Otherwise a transient
    // facilitator-supported() failure would poison this worker forever.
    serverPromise = null;
    throw err;
  });
  return serverPromise;
}
