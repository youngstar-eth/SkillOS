"use client";

// ───────────────────────────────────────────────────────────────────────────
// ModeChooser — landing-page mode picker rendered at each game subdomain root.
//
// Two cards: Solo (live, primary) and 1v1 Duel (Phase 2, muted). Keeps the
// duel narrative visible at the discovery surface so the pitch story still
// scans as "skill platform with multiple modes," while routing every current
// click into the working solo flow.
//
// When duels ship in Phase 2, drop the `duelComingSoon` branch and wire the
// duel CTA to /duel/waiting (or the new entry point).
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";

export interface ModeChooserProps {
  /** Game name shown above the cards, e.g. "2048", "Wordle", "Sudoku". */
  gameName: string;
  /** Solo CTA destination. Defaults to "/tournament/solo". */
  soloHref?: string;
  /** Subhead under the game name; defaults to canonical positioning. */
  subhead?: string;
  /** Optional per-game tile node rendered in the eyebrow in place of the
   * default gold dot. Sized by the caller (~14px square). */
  tile?: React.ReactNode;
}

export function ModeChooser({
  gameName,
  soloHref = "/tournament/solo",
  subhead = "Daily skill tournaments on Base",
  tile,
}: ModeChooserProps) {
  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl">
        <header className="text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-elev px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
            {tile ?? (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-skill" />
            )}
            SkillOS · {gameName}
          </p>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">
            Choose your mode
          </h1>
          <p className="mt-3 text-sm text-neutral-400 sm:text-base">{subhead}</p>
        </header>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <SoloCard href={soloHref} />
          <DuelCard />
        </div>

        <p className="mt-10 text-center text-xs text-neutral-500">
          Phase 2: SP-based matchmaking · on-chain wagering · verified results
        </p>
      </div>
    </main>
  );
}

function SoloCard({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-skill/40 bg-bg-elev p-6 transition hover:border-skill hover:bg-bg-elev2"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.22em] text-skill">
          Live
        </span>
        <span className="rounded-full border border-skill/30 bg-skill/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-skill">
          Daily ranked
        </span>
      </div>

      <h2 className="mt-4 text-2xl font-semibold tracking-tight">Solo</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Daily ranked tournaments
      </p>

      <ul className="mt-5 flex flex-col gap-2 text-sm text-neutral-300">
        <Bullet>Pay-then-play retries</Bullet>
        <Bullet>AI-reviewed scoring</Bullet>
        <Bullet>Skill Points (SP) on every verified run</Bullet>
      </ul>

      <span className="mt-6 inline-flex items-center justify-center rounded-xl bg-skill px-4 py-2.5 text-sm font-semibold text-black transition group-hover:opacity-90">
        Play Solo →
      </span>
    </Link>
  );
}

function DuelCard() {
  return (
    <div
      aria-disabled="true"
      title="Duels are landing in Phase 2"
      className="flex cursor-not-allowed flex-col rounded-2xl border border-dashed border-border-subtle bg-bg-elev/40 p-6 opacity-60"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.22em] text-neutral-500">
          Coming soon
        </span>
        <span className="rounded-full border border-border-subtle bg-bg-elev px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-400">
          Phase 2
        </span>
      </div>

      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-200">
        1v1 Duel
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        Skill-matched competitive play
      </p>

      <ul className="mt-5 flex flex-col gap-2 text-sm text-neutral-400">
        <Bullet muted>SP-based matchmaking</Bullet>
        <Bullet muted>On-chain wagering</Bullet>
        <Bullet muted>Verified results</Bullet>
      </ul>

      <span className="mt-6 inline-flex items-center justify-center rounded-xl border border-border-subtle bg-bg-elev px-4 py-2.5 text-sm font-medium text-neutral-500">
        Coming Phase 2
      </span>
    </div>
  );
}

function Bullet({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className={`mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full ${muted ? "bg-neutral-600" : "bg-skill"}`}
      />
      <span>{children}</span>
    </li>
  );
}
