// ───────────────────────────────────────────────────────────────────────────
// Sponsor dashboard read API — list contributions by sponsor address.
//
// Free internal endpoint (no x402 paywall) — read path for the sponsor
// dashboard at /sponsor/dashboard. Anonymous Supabase RLS already permits
// SELECT on v2_sponsor_contributions, but going through the API gives us
// uniform error shape, optional joins (e.g. tournament metadata), and
// future caching headers.
// ───────────────────────────────────────────────────────────────────────────

import { getSupabaseService } from "@skillos/lib-shared";

interface ContributionRow {
  tournament_on_chain_id: string;
  amount_usdc: string;
  receipt_token_id: string;
  tx_hash: string;
  block_number: string;
  indexed_at: string;
}

export interface SponsorContributionsResponse {
  sponsor: string;
  totalUsdc: string;
  contributions: ContributionRow[];
}

export function createSponsorContributionsHandler(): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const url = new URL(req.url);
    const address = url.searchParams.get("address");
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return Response.json({ error: "address must be 0x-prefixed 40-hex" }, { status: 400 });
    }

    const supabase = getSupabaseService();
    const { data, error } = await supabase
      .from("v2_sponsor_contributions")
      .select(
        "tournament_on_chain_id, amount_usdc, receipt_token_id, tx_hash, block_number, indexed_at",
      )
      .eq("sponsor_address", address.toLowerCase())
      .order("indexed_at", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const contributions = (data ?? []) as ContributionRow[];
    const totalUsdc = contributions
      .reduce((sum, r) => sum + Number(r.amount_usdc), 0)
      .toFixed(6);

    const body: SponsorContributionsResponse = {
      sponsor: address.toLowerCase(),
      totalUsdc,
      contributions,
    };
    return Response.json(body);
  };
}
