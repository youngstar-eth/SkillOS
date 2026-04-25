"use client";

// ───────────────────────────────────────────────────────────────────────────
// DuelComingSoon — placeholder served at every /duel/* route while duels
// are paused for Phase 2. Friendlier than 404; tells users where to play
// today (solo tournaments) without losing the duel narrative on the URL.
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";

export function DuelComingSoon() {
  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-elev px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-500" />
          Phase 2
        </p>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
          Duel mode coming Phase 2
        </h1>

        <p className="mt-3 text-sm text-neutral-400 sm:text-base">
          We&apos;re polishing competitive duels with SP-based matchmaking and
          on-chain wagering. Head to solo tournaments to compete today.
        </p>

        <Link
          href="/tournament/solo"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-skill px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-yellow-400"
        >
          Play solo →
        </Link>
      </div>
    </main>
  );
}
