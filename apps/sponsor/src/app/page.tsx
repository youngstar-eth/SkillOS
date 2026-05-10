"use client";

// ───────────────────────────────────────────────────────────────────────────
// /sponsor — root tournament listing.
//
// Cross-game active tournaments, sorted by ends_at ASC. Each row renders
// game, cycle, time remaining, current prize pool, external sponsor count,
// and a [Sponsor a Pool] CTA → /sponsor/[onChainId].
//
// 5-minute auto-refetch matches the cron indexer cadence; sponsor counts
// reflect the latest on-chain state within ~5 min of a fund tx mining.
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SponsorTournamentListResponse } from "@skillos/duel-backend";

const REFETCH_MS = 5 * 60 * 1000;

function fmtUsdc(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function fmtTimeRemaining(endsAtIso: string): string {
  const ends = new Date(endsAtIso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((ends - now) / 1000));
  if (diffSec <= 0) return "ended";
  const days = Math.floor(diffSec / 86_400);
  if (days >= 1) return `${days}d ${Math.floor((diffSec % 86_400) / 3600)}h`;
  const hours = Math.floor(diffSec / 3600);
  if (hours >= 1) return `${hours}h ${Math.floor((diffSec % 3600) / 60)}m`;
  return `${Math.floor(diffSec / 60)}m`;
}

export default function SponsorRoot() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sponsor", "tournaments"],
    queryFn: async (): Promise<SponsorTournamentListResponse> => {
      const res = await fetch("/api/sponsor/tournaments");
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      return res.json();
    },
    refetchInterval: REFETCH_MS,
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Sponsor a Pool</h1>
        <p className="mt-2 max-w-xl text-base text-neutral-400">
          Anyone can fund a SkillOS tournament prize pool. On-chain. Brand-verified
          via soulbound receipt. No application required.
        </p>
        <div className="mt-4 flex gap-3">
          <Link
            href="/dashboard"
            className="rounded-md border border-border bg-bg-elev px-3 py-1.5 text-sm hover:border-skill"
          >
            My sponsorships
          </Link>
        </div>
      </header>

      {isLoading && <div className="text-neutral-400">Loading active tournaments…</div>}
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">
          Failed to load tournaments: {(error as Error).message}
        </div>
      )}

      {data && data.tournaments.length === 0 && (
        <div className="rounded-md border border-border-subtle bg-bg-elev p-6 text-neutral-400">
          No active tournaments right now. New tournaments are created hourly — check
          back soon.
        </div>
      )}

      {data && data.tournaments.length > 0 && (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle bg-bg-elev">
          {data.tournaments.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold">{t.game}</span>
                  <span className="rounded-sm bg-bg-elev2 px-1.5 py-0.5 text-xs uppercase tracking-wide text-neutral-400">
                    {t.cycleType}
                  </span>
                </div>
                <div className="mt-1 text-sm text-neutral-400">
                  Ends in {fmtTimeRemaining(t.endsAt)} · Pool ${fmtUsdc(t.prizePoolUsdc)}{" "}
                  USDC · {t.externalSponsorCount}{" "}
                  external sponsor{t.externalSponsorCount === 1 ? "" : "s"} (+$
                  {fmtUsdc(t.externalSponsorTotalUsdc)})
                </div>
              </div>
              <Link
                href={`/${t.onChainId}`}
                className="shrink-0 rounded-md bg-skill px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
              >
                Sponsor a Pool
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
