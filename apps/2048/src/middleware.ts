// ───────────────────────────────────────────────────────────────────────────
// Next 14 middleware — x402 payment gate for /api/public/*.
//
// We can't use @x402/next's paymentProxy here (requires Next 16). Instead
// we drive @x402/core's x402HTTPResourceServer through a hand-written
// Next.js HTTP adapter.
//
// Flow per protected request:
//   1. processHTTPRequest    — matches route, verifies x-payment header
//   2. if verified, processSettlement — settles on-chain via facilitator
//   3. forward to the route handler with settlement headers merged onto the
//      response
//
// We settle before the handler runs (the handler can't roll back an
// on-chain transfer anyway). Settlement headers (x-payment-response)
// ride out on the final 200 so clients can parse tx hashes.
// ───────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import type {
  HTTPAdapter,
  HTTPRequestContext,
  HTTPResponseInstructions,
} from "@x402/core/http";
import { getX402Server } from "./lib/x402-server";

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

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const server = await getX402Server();
  const adapter = createAdapter(request);
  const context: HTTPRequestContext = {
    adapter,
    path: adapter.getPath(),
    method: adapter.getMethod(),
    paymentHeader: request.headers.get("x-payment") ?? undefined,
  };

  const result = await server.processHTTPRequest(context);

  if (result.type === "no-payment-required") {
    return NextResponse.next();
  }

  if (result.type === "payment-error") {
    return respond(result.response);
  }

  // payment-verified → settle now, attach headers to pass-through response.
  const settle = await server.processSettlement(
    result.paymentPayload,
    result.paymentRequirements,
    result.declaredExtensions,
  );
  if (!settle.success) {
    return respond(settle.response);
  }

  const response = NextResponse.next();
  for (const [name, value] of Object.entries(settle.headers)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: ["/api/public/:path*"],
};
