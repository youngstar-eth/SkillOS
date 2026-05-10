// ───────────────────────────────────────────────────────────────────────────
// Tournament-pool view API — list sponsors of a single tournament.
//
// Free internal endpoint (no x402). Drives the "who's funding this pool"
// section on /sponsor/[tournamentId]. Aggregates by sponsor_address (sum
// of all their contributions to this tournament), since the receipt SBT
// model permits a single sponsor to mint multiple receipts on the same
// tournament across multiple sponsorPool() calls.
// ───────────────────────────────────────────────────────────────────────────

import { getSupabaseService } from "@skillos/lib-shared";

interface AggregatedSponsor {
  sponsor_address: string;
  total_usdc: string;
  contribution_count: number;
  first_at: string;
}

export interface TournamentSponsorsResponse {
  tournamentOnChainId: string;
  uniqueSponsorCount: number;
  totalUsdc: string;
  sponsors: AggregatedSponsor[];
}

/**
 * Handler factory. Expects the route to populate `tournamentId` via
 * Next.js dynamic-segment params and pass it into the returned handler.
 */
export function createTournamentSponsorsHandler(): (
  req: Request,
  ctx: { params: Promise<{ tournamentId: string }> },
) => Promise<Response> {
  return async (_req, ctx) => {
    const { tournamentId } = await ctx.params;
    if (!/^0x[0-9a-fA-F]{64}$/.test(tournamentId)) {
      return Response.json(
        { error: "tournamentId must be 0x-prefixed 64-hex (bytes32)" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseService();
    const { data, error } = await supabase
      .from("v2_sponsor_contributions")
      .select("sponsor_address, amount_usdc, indexed_at")
      .eq("tournament_on_chain_id", tournamentId.toLowerCase())
      .order("indexed_at", { ascending: true });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Aggregate per sponsor (preserve first_at = earliest contribution).
    const byAddr = new Map<string, AggregatedSponsor>();
    let totalUsdcRaw = 0;
    for (const row of data ?? []) {
      totalUsdcRaw += Number(row.amount_usdc);
      const existing = byAddr.get(row.sponsor_address);
      if (existing) {
        existing.total_usdc = (Number(existing.total_usdc) + Number(row.amount_usdc)).toFixed(6);
        existing.contribution_count += 1;
      } else {
        byAddr.set(row.sponsor_address, {
          sponsor_address: row.sponsor_address,
          total_usdc: Number(row.amount_usdc).toFixed(6),
          contribution_count: 1,
          first_at: row.indexed_at,
        });
      }
    }

    // Sort sponsors by total_usdc desc — top contributors first.
    const sponsors = Array.from(byAddr.values()).sort(
      (a, b) => Number(b.total_usdc) - Number(a.total_usdc),
    );

    const body: TournamentSponsorsResponse = {
      tournamentOnChainId: tournamentId.toLowerCase(),
      uniqueSponsorCount: sponsors.length,
      totalUsdc: totalUsdcRaw.toFixed(6),
      sponsors,
    };
    return Response.json(body);
  };
}
