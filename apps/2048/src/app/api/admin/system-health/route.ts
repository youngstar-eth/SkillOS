// ───────────────────────────────────────────────────────────────────────────
// System health snapshot for the Skillbase v2 testnet stack.
//
// Combines wallet balance + cron health into a single JSON envelope so
// external schedulers (cron-job.org, Pingdom, Hetrix, etc.) can hit one
// URL daily and decide whether to fire a webhook alert based on
// `overall_alert: bool`.
//
// Auth: Bearer ADMIN_API_TOKEN (matches /api/admin/flags pattern).
//   Authorization: Bearer <ADMIN_API_TOKEN>
// Missing/malformed/mismatched → 401. Mis-configured (no token) → 401
// (fail closed).
//
// Why this exists alongside /api/sp-snapshot-status:
//   /api/sp-snapshot-status — public, narrow, anchor-only, smoke-runner-friendly
//   /api/admin/system-health (this) — auth-gated, broad, wallet + cron, ops/alerting
//
// Thresholds (per Phase 2 hygiene Sprint B spec):
//   USDC: < 30 USDC remaining  → low_usdc        (≈ 5 days runway)
//   ETH:  < 0.01 ETH (1e16 wei) → low_eth         (gas dropping)
//   anchor: 0 rows today       → anchor_missed   (cron didn't fire / failed)
//   tournaments: <6 rows today → tournaments_missed (daily cron incomplete)
//
// Pre-cron-fire grace: anchor cron runs at 02:07 UTC; tournament cron at
// 00:00 UTC. If checked before today's expected fire window, alert fires
// (correct fail-loud signal). Operators run this once per day post-window.
// ───────────────────────────────────────────────────────────────────────────

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { createPublicClient, http, erc20Abi } from "viem";
import { baseSepolia } from "viem/chains";
import { getSupabaseService } from "@skillbase/lib-shared";
import { USDC_ADDRESS } from "@skillbase/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Studio sponsor wallet — funds tournament creation, anchor cron gas, and
// receives x402 settlement. Hardcoded constant: this is a public address,
// matches X402_PAY_TO + the SkillbaseAnchor authorized anchor.
const STUDIO_ADDRESS = "0xA24f9122568e98b72f4dDD61119C7D92D0975692" as const;

const USDC_DECIMALS = 6;
const ETH_DECIMALS = 18;

const LOW_USDC_THRESHOLD = 30n * 10n ** BigInt(USDC_DECIMALS); // 30 USDC
const LOW_ETH_THRESHOLD = 10n ** 16n; // 0.01 ETH

const EXPECTED_DAILY_TOURNAMENTS = 6;

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function formatBigIntDecimal(value: bigint, decimals: number): string {
  const s = value.toString().padStart(decimals + 1, "0");
  const head = s.slice(0, -decimals);
  const tail = s.slice(-decimals).replace(/0+$/, "");
  return tail ? `${head}.${tail}` : head;
}

function resolveRpcUrl(): string {
  return (
    process.env.BASE_SEPOLIA_RPC_URL ??
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ??
    "https://sepolia.base.org"
  );
}

interface AlertEntry {
  code:
    | "low_usdc"
    | "low_eth"
    | "anchor_missed_today"
    | "tournaments_missed_today";
  detail: string;
}

export async function GET(req: NextRequest): Promise<Response> {
  // ─── auth ────────────────────────────────────────────────────────────
  const configToken = process.env.ADMIN_API_TOKEN;
  if (!configToken || configToken.length === 0) {
    console.error("[admin/system-health] ADMIN_API_TOKEN not set");
    return unauthorized();
  }
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return unauthorized();
  }
  const providedToken = authHeader.slice("Bearer ".length).trim();
  if (!safeEqual(providedToken, configToken)) {
    return unauthorized();
  }

  const alerts: AlertEntry[] = [];

  // ─── on-chain balance reads ─────────────────────────────────────────
  const pub = createPublicClient({
    chain: baseSepolia,
    transport: http(resolveRpcUrl()),
  });

  let usdcBalance = 0n;
  let ethBalance = 0n;
  let walletReadError: string | null = null;
  try {
    const [usdcRes, ethRes] = await Promise.all([
      pub.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [STUDIO_ADDRESS],
      }),
      pub.getBalance({ address: STUDIO_ADDRESS }),
    ]);
    usdcBalance = usdcRes;
    ethBalance = ethRes;
  } catch (err) {
    walletReadError = err instanceof Error ? err.message : String(err);
    console.error("[admin/system-health] wallet read failed", err);
  }

  if (!walletReadError) {
    if (usdcBalance < LOW_USDC_THRESHOLD) {
      alerts.push({
        code: "low_usdc",
        detail: `Studio wallet USDC ${formatBigIntDecimal(usdcBalance, USDC_DECIMALS)} below threshold ${formatBigIntDecimal(LOW_USDC_THRESHOLD, USDC_DECIMALS)}. Top up via Coinbase faucet or transfer.`,
      });
    }
    if (ethBalance < LOW_ETH_THRESHOLD) {
      alerts.push({
        code: "low_eth",
        detail: `Studio wallet ETH ${formatBigIntDecimal(ethBalance, ETH_DECIMALS)} below threshold ${formatBigIntDecimal(LOW_ETH_THRESHOLD, ETH_DECIMALS)}. Anchor cron will start failing on gas.`,
      });
    }
  }

  // ─── cron health (Supabase reads) ───────────────────────────────────
  const supabase = getSupabaseService();
  const todayStartUtc = new Date();
  todayStartUtc.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStartUtc.toISOString();

  let anchorRowsToday = 0;
  let tournamentRowsToday = 0;
  let cronReadError: string | null = null;
  try {
    const [anchorRes, tournamentsRes] = await Promise.all([
      supabase
        .from("v2_sp_snapshots")
        .select("snapshot_id", { count: "exact", head: true })
        .gte("anchored_at", todayIso)
        .not("anchor_tx_hash", "is", null),
      supabase
        .from("v2_tournaments")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayIso)
        .eq("cycle_type", "daily"),
    ]);
    if (anchorRes.error) throw anchorRes.error;
    if (tournamentsRes.error) throw tournamentsRes.error;
    anchorRowsToday = anchorRes.count ?? 0;
    tournamentRowsToday = tournamentsRes.count ?? 0;
  } catch (err) {
    cronReadError = err instanceof Error ? err.message : String(err);
    console.error("[admin/system-health] cron read failed", err);
  }

  if (!cronReadError) {
    if (anchorRowsToday === 0) {
      alerts.push({
        code: "anchor_missed_today",
        detail:
          "No anchored SP snapshot for today. Anchor cron (02:07 UTC) didn't fire or the on-chain anchor tx failed. Inspect /api/sp-snapshot-status + Vercel cron logs.",
      });
    }
    if (tournamentRowsToday < EXPECTED_DAILY_TOURNAMENTS) {
      alerts.push({
        code: "tournaments_missed_today",
        detail: `Only ${tournamentRowsToday}/${EXPECTED_DAILY_TOURNAMENTS} daily tournaments created today. create-tournaments cron (00:00 UTC) didn't complete.`,
      });
    }
  }

  // ─── envelope ────────────────────────────────────────────────────────
  const overallAlert = alerts.length > 0;
  const status = overallAlert ? "alert" : "ok";

  return Response.json(
    {
      status,
      overall_alert: overallAlert,
      checked_at: new Date().toISOString(),
      wallet: {
        address: STUDIO_ADDRESS,
        usdc: formatBigIntDecimal(usdcBalance, USDC_DECIMALS),
        usdc_raw: usdcBalance.toString(),
        eth: formatBigIntDecimal(ethBalance, ETH_DECIMALS),
        eth_raw: ethBalance.toString(),
        read_error: walletReadError,
      },
      cron: {
        today_utc: todayIso.slice(0, 10),
        anchor_today: anchorRowsToday,
        tournaments_today: tournamentRowsToday,
        tournaments_expected: EXPECTED_DAILY_TOURNAMENTS,
        read_error: cronReadError,
      },
      alerts,
    },
    {
      status: overallAlert ? 200 : 200, // Always 200; consumers check overall_alert
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
