// ───────────────────────────────────────────────────────────────────────────
// /api/paymaster — proxy to CDP Paymaster RPC.
//
// Smart Wallet users get gasless transactions via EIP-5792 sendCalls with
// capabilities.paymasterService.url pointing here. This proxy keeps the
// real CDP_PAYMASTER_URL (which embeds a project key) server-only.
//
// Allowlist of pm_* methods defends against arbitrary RPC abuse — the
// proxy rejects anything that isn't a paymaster-related JSON-RPC call.
// ───────────────────────────────────────────────────────────────────────────

import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_METHODS = new Set([
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
  "pm_sponsorUserOperation",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const upstream = process.env.CDP_PAYMASTER_URL;
  if (!upstream) {
    return NextResponse.json(
      { error: "Paymaster not configured" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.method !== "string") {
    return NextResponse.json(
      { error: "Invalid JSON-RPC body" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (!ALLOWED_METHODS.has(body.method)) {
    return NextResponse.json(
      { error: `Method ${body.method} not allowed via paymaster proxy` },
      { status: 403, headers: CORS_HEADERS },
    );
  }

  const res = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
