"use client";

// ───────────────────────────────────────────────────────────────────────────
// /dashboard — sponsor's contribution history.
//
// Lists every sponsorship the connected wallet has made: tournament id,
// amount, receipt token id, tx hash, time. Aggregates total contributed.
// Read path is the indexer-populated v2_sponsor_contributions, so the
// list is at most ~5 minutes behind the chain (cron cadence).
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type { SponsorContributionsResponse } from "@skillos/duel-backend";

const REFETCH_MS = 60 * 1000;

function fmtUsdc(s: string): string {
  const n = Number(s);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
    : s;
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const diffMin = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function shortHex(s: string): string {
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

export default function SponsorDashboard() {
  const { address, isConnected } = useAccount();

  const { data, isLoading, error } = useQuery({
    queryKey: ["sponsor", "contributions", address],
    queryFn: async (): Promise<SponsorContributionsResponse> => {
      const res = await fetch(
        `/api/sponsor/contributions?address=${address}`,
      );
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: isConnected && !!address,
    refetchInterval: REFETCH_MS,
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-neutral-400 hover:text-skill">
        ← All tournaments
      </Link>

      <h1 className="mt-3 text-3xl font-bold">My Sponsorships</h1>

      {!isConnected && (
        <div className="mt-6 rounded-md border border-border-subtle bg-bg-elev p-6 text-neutral-400">
          Connect your wallet to view your sponsorship history.
        </div>
      )}

      {isConnected && isLoading && (
        <div className="mt-6 text-neutral-400">Loading contributions…</div>
      )}

      {isConnected && error && (
        <div className="mt-6 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">
          Failed to load: {(error as Error).message}
        </div>
      )}

      {isConnected && data && data.contributions.length === 0 && (
        <div className="mt-6 rounded-md border border-border-subtle bg-bg-elev p-6 text-neutral-400">
          No sponsorships yet. Recently-funded sponsorships may take up to 5 minutes
          to appear (indexer cadence).{" "}
          <Link href="/" className="text-skill underline">
            Browse tournaments →
          </Link>
        </div>
      )}

      {isConnected && data && data.contributions.length > 0 && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-md border border-border-subtle bg-bg-elev p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Total contributed
              </div>
              <div className="mt-1 font-mono text-2xl text-skill">
                ${fmtUsdc(data.totalUsdc)}
              </div>
            </div>
            <div className="rounded-md border border-border-subtle bg-bg-elev p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Pools sponsored
              </div>
              <div className="mt-1 font-mono text-2xl">
                {data.contributions.length}
              </div>
            </div>
          </div>

          <ul className="mt-8 divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle bg-bg-elev">
            {data.contributions.map((c) => (
              <li
                key={`${c.tx_hash}-${c.receipt_token_id}`}
                className="flex items-center justify-between gap-4 px-4 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-base">
                      ${fmtUsdc(c.amount_usdc)} USDC
                    </span>
                    <span className="rounded-sm bg-bg-elev2 px-1.5 py-0.5 text-xs text-neutral-400">
                      Receipt #{c.receipt_token_id}
                    </span>
                  </div>
                  <div className="mt-1 break-all font-mono text-xs text-neutral-500">
                    Tournament {shortHex(c.tournament_on_chain_id)}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {fmtRelative(c.indexed_at)} ·{" "}
                    <a
                      href={`https://sepolia.basescan.org/tx/${c.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-skill underline"
                    >
                      {shortHex(c.tx_hash)}
                    </a>
                  </div>
                </div>
                <Link
                  href={`/${c.tournament_on_chain_id}`}
                  className="shrink-0 rounded-md border border-border bg-bg-elev2 px-3 py-1.5 text-sm hover:border-skill"
                >
                  View pool
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
