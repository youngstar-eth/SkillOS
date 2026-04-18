import type { Metadata } from "next";
import { CATEGORIES, type CategoryKey } from "@mas/shared/leaderboard";
import { LeaderboardTabs } from "./LeaderboardTabs";

export const metadata: Metadata = {
  title: "Leaderboards — skillbase",
  description:
    "Daily ranks across all 20 skillbase games — overall, by category, and per-game.",
};

export const dynamic = "force-dynamic";

export default function LeaderboardPage() {
  return (
    <main>
      <header className="topnav">
        <div className="wrap inner">
          <a href="/" className="brand" aria-label="skillbase home">
            <img src="/assets/sb-monogram.svg" alt="skillbase" />
            <div className="wm">
              skillbase
              <small>skill market on Base</small>
            </div>
          </a>
          <nav className="nav">
            <a href="/#games">Arcade</a>
            <a href="/#ai">AI</a>
            <a href="/leaderboard">Leaderboards</a>
            <a href="/#how">How it works</a>
          </nav>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <a href="/#games" className="btn btn-primary btn-pill">
              Start playing
            </a>
          </div>
        </div>
      </header>

      <section
        className="band"
        style={{ paddingTop: 64, paddingBottom: 48 }}
      >
        <div className="wrap">
          <div className="sec-hd">
            <div>
              <div className="eyebrow">Today&rsquo;s leaderboards</div>
              <h2>Top players. Daily reset.</h2>
            </div>
            <p className="rhs">
              Per-game best-scores feed the category and overall ranks. Multi-
              game bonus (×1.5) for anyone who plays {"5+"} different games on
              the same day. Payouts run nightly.
            </p>
          </div>

          <LeaderboardTabs
            categories={Object.entries(CATEGORIES).map(([key, def]) => ({
              key: key as CategoryKey,
              label: def.label,
              games: def.games as readonly string[],
            }))}
          />
        </div>
      </section>
    </main>
  );
}
