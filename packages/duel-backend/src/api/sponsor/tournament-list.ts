// ───────────────────────────────────────────────────────────────────────────
// Cross-game tournament listing for the sponsor app root (/sponsor).
//
// Returns active tournaments across ALL games (no per-game filter, unlike
// createTournamentActiveHandler which serves a single game's app). Joins
// v2_tournaments with an aggregated sponsor count from v2_sponsor_contributions
// so the listing row can show "12 sponsors backing this pool" without an
// N+1 client-side fetch.
//
// Active = settled_at IS NULL AND ends_at > now(). Sorted by ends_at ASC
// so the soonest-ending appear first (most-sponsorable in the post-end-
// pre-settle window).
// ───────────────────────────────────────────────────────────────────────────

import { getSupabaseService } from "@skillbase/lib-shared";

export interface SponsorTournamentListItem {
  id: string;
  onChainId: string;
  game: string;
  cycleType: "daily" | "weekly";
  startsAt: string;
  endsAt: string;
  prizePoolUsdc: string;
  sponsorAddress: string;
  participationBonus: number;
  // Aggregate from v2_sponsor_contributions.
  externalSponsorCount: number;
  externalSponsorTotalUsdc: string;
}

export interface SponsorTournamentListResponse {
  tournaments: SponsorTournamentListItem[];
}

export function createSponsorTournamentListHandler(): (req: Request) => Promise<Response> {
  return async () => {
    const supabase = getSupabaseService();
    const nowIso = new Date().toISOString();

    const { data: tournaments, error: tErr } = await supabase
      .from("v2_tournaments")
      .select(
        "id, on_chain_id, game, cycle_type, starts_at, ends_at, prize_pool_usdc, participation_bonus, sponsor_address",
      )
      .is("settled_at", null)
      .gt("ends_at", nowIso)
      .order("ends_at", { ascending: true });

    if (tErr) {
      return Response.json({ error: tErr.message }, { status: 500 });
    }
    const rows = (tournaments ?? []) as Array<Record<string, unknown>>;

    // Aggregate external sponsor stats keyed by tournament_on_chain_id.
    const onChainIds = rows.map((r) => (r.on_chain_id as string).toLowerCase());

    const sponsorCountByTid = new Map<string, { count: number; totalUsdc: number }>();
    if (onChainIds.length > 0) {
      const { data: contribRows, error: cErr } = await supabase
        .from("v2_sponsor_contributions")
        .select("tournament_on_chain_id, sponsor_address, amount_usdc")
        .in("tournament_on_chain_id", onChainIds);
      if (cErr) {
        return Response.json({ error: cErr.message }, { status: 500 });
      }

      const seenSponsors = new Map<string, Set<string>>(); // tid → set of sponsor addrs
      for (const c of contribRows ?? []) {
        const tid = (c.tournament_on_chain_id as string).toLowerCase();
        const sponsor = (c.sponsor_address as string).toLowerCase();
        const amount = Number(c.amount_usdc);

        if (!seenSponsors.has(tid)) seenSponsors.set(tid, new Set());
        seenSponsors.get(tid)!.add(sponsor);

        const agg = sponsorCountByTid.get(tid) ?? { count: 0, totalUsdc: 0 };
        agg.totalUsdc += amount;
        sponsorCountByTid.set(tid, agg);
      }
      for (const [tid, sponsors] of seenSponsors) {
        const agg = sponsorCountByTid.get(tid)!;
        agg.count = sponsors.size;
      }
    }

    const items: SponsorTournamentListItem[] = rows.map((r) => {
      const tid = (r.on_chain_id as string).toLowerCase();
      const agg = sponsorCountByTid.get(tid) ?? { count: 0, totalUsdc: 0 };
      return {
        id: r.id as string,
        onChainId: tid,
        game: r.game as string,
        cycleType: r.cycle_type as "daily" | "weekly",
        startsAt: r.starts_at as string,
        endsAt: r.ends_at as string,
        prizePoolUsdc: String(r.prize_pool_usdc),
        sponsorAddress: r.sponsor_address as string,
        participationBonus: Number(r.participation_bonus),
        externalSponsorCount: agg.count,
        externalSponsorTotalUsdc: agg.totalUsdc.toFixed(6),
      };
    });

    const body: SponsorTournamentListResponse = { tournaments: items };
    return Response.json(body);
  };
}
