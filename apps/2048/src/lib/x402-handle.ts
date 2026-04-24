// ───────────────────────────────────────────────────────────────────────────
// x402 verify + settle wrapper for Node-runtime route handlers.
//
// Originally we ran this in Next 14 middleware (Edge runtime), but the CDP
// JWT path (@coinbase/cdp-sdk -> axios) pulls in setImmediate /
// process.nextTick / CompressionStream — all Node-only. Rather than swap
// facilitator auth libraries, we moved the whole x402 flow into the route
// handler (which runs on Node by default).
//
// Shape is a higher-order handler — routes pass their core business logic
// as `inner`, receive back a verified `ctx` + whatever Response shape they
// want. On verified payment, we call `inner`, then unconditionally settle
// (payment is non-refundable per the sample-tier spec) and attach the
// facilitator's settlement headers (x-payment-response) to the response
// the inner handler returned.
// ───────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import type {
  HTTPAdapter,
  HTTPRequestContext,
  HTTPResponseInstructions,
} from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequirements,
} from "@x402/core/types";
import { getX402Server } from "./x402-server";

export interface X402Context {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  declaredExtensions?: Record<string, unknown>;
}

function createAdapter(request: NextRequest): HTTPAdapter {
  const url = request.nextUrl;
  return {
    getHeader: (name) => request.headers.get(name) ?? undefined,
    getMethod: () => request.method,
    getPath: () => url.pathname,
    getUrl: () => request.url,
    getAcceptHeader: () => request.headers.get("accept") ?? "",
    getUserAgent: () => request.headers.get("user-agent") ?? "",
    getQueryParams: () => {
      const out: Record<string, string | string[]> = {};
      for (const key of url.searchParams.keys()) {
        const values = url.searchParams.getAll(key);
        out[key] = values.length === 1 ? values[0] : values;
      }
      return out;
    },
    getQueryParam: (name) => {
      const values = url.searchParams.getAll(name);
      if (values.length === 0) return undefined;
      return values.length === 1 ? values[0] : values;
    },
  };
}

function respond(instructions: HTTPResponseInstructions): NextResponse {
  const headers = new Headers(instructions.headers);
  if (instructions.body === undefined || instructions.body === null) {
    return new NextResponse(null, { status: instructions.status, headers });
  }
  if (instructions.isHtml && typeof instructions.body === "string") {
    headers.set("content-type", "text/html; charset=utf-8");
    return new NextResponse(instructions.body, {
      status: instructions.status,
      headers,
    });
  }
  const body =
    typeof instructions.body === "string"
      ? instructions.body
      : JSON.stringify(instructions.body);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new NextResponse(body, { status: instructions.status, headers });
}

/**
 * Wrap a route handler so it receives a verified x402 payment context and
 * its response is decorated with settlement headers.
 *
 * The inner handler should return whatever Response it wants (200, 429,
 * 400, 500 — all fine). Settlement still runs after the inner returns
 * because the sample-tier spec explicitly says payment is non-refundable
 * on handler-level failures (rate limits, upstream AI errors).
 *
 * The only case where we skip calling the inner is when verify failed —
 * the 402 / payment-error instructions from the resource server take
 * precedence.
 */
export function withX402(
  inner: (request: NextRequest, ctx: X402Context) => Promise<Response>,
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest): Promise<Response> => {
    let server;
    try {
      server = await getX402Server();
    } catch (err) {
      console.error("[x402] resource server init failed", err);
      return NextResponse.json(
        { error: "x402_init_failed", message: (err as Error).message },
        { status: 500 },
      );
    }

    const adapter = createAdapter(request);
    const context: HTTPRequestContext = {
      adapter,
      path: adapter.getPath(),
      method: adapter.getMethod(),
      paymentHeader: request.headers.get("x-payment") ?? undefined,
    };

    let processed;
    try {
      processed = await server.processHTTPRequest(context);
    } catch (err) {
      console.error("[x402] processHTTPRequest threw", err);
      return NextResponse.json(
        { error: "x402_verify_failed", message: (err as Error).message },
        { status: 500 },
      );
    }

    if (processed.type === "no-payment-required") {
      // Route is registered — shouldn't land here. Fail closed rather
      // than silently let a free call through.
      return NextResponse.json(
        { error: "payment_required" },
        { status: 402 },
      );
    }

    if (processed.type === "payment-error") {
      return respond(processed.response);
    }

    // Verified. Run the inner handler; catch exceptions so we still settle
    // (payment is non-refundable once the buyer signed it).
    let innerResponse: Response;
    try {
      innerResponse = await inner(request, {
        paymentPayload: processed.paymentPayload,
        paymentRequirements: processed.paymentRequirements,
        declaredExtensions: processed.declaredExtensions,
      });
    } catch (err) {
      console.error("[x402] inner handler threw after verify", err);
      innerResponse = NextResponse.json(
        {
          error: "handler_failure",
          message:
            "Handler failed after payment validated. Payment non-refundable in sample tier.",
        },
        { status: 500 },
      );
    }

    let settle;
    try {
      settle = await server.processSettlement(
        processed.paymentPayload,
        processed.paymentRequirements,
        processed.declaredExtensions,
      );
    } catch (err) {
      console.error("[x402] settle threw", err);
      return NextResponse.json(
        {
          error: "settle_failed",
          message: (err as Error).message,
        },
        { status: 402 },
      );
    }

    if (!settle.success) {
      return respond(settle.response);
    }

    // Attach settle headers to whatever the inner produced.
    for (const [name, value] of Object.entries(settle.headers)) {
      innerResponse.headers.set(name, value);
    }
    return innerResponse;
  };
}
