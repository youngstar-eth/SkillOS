"use client";

import { useEffect, useState } from "react";
import type { CategoryKey } from "@mas/shared/leaderboard";

interface Tab {
  key: "overall" | CategoryKey;
  label: string;
}

interface AggregateRow {
  user_address: string;
  rank: number;
  total_points: number;
  games_played: number;
  multi_game_bonus_applied: boolean;
}

const SHORT = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function LeaderboardTabs({
  categories,
}: {
  categories: Array<{
    key: CategoryKey;
    label: string;
    games: readonly string[];
  }>;
}) {
  const tabs: Tab[] = [
    { key: "overall", label: "Overall" },
    ...categories.map((c) => ({ key: c.key, label: c.label })),
  ];

  const [active, setActive] = useState<Tab["key"]>("overall");
  const [rows, setRows] = useState<AggregateRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(false);

    const url =
      active === "overall"
        ? `/api/leaderboard/overall?limit=50`
        : `/api/leaderboard/category?cat=${active}&limit=50`;

    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as { leaderboard: AggregateRow[] };
      })
      .then((d) => {
        if (!cancelled) setRows(d.leaderboard);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  return (
    <div>
      {/* ---- Tabs ---- */}
      <div
        role="tablist"
        aria-label="Leaderboard scopes"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: "1px solid rgb(var(--color-border))",
        }}
      >
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: on
                  ? "var(--skill-yellow)"
                  : "rgb(var(--color-border))",
                background: on
                  ? "rgba(255, 199, 44, 0.08)"
                  : "transparent",
                color: on
                  ? "var(--skill-yellow)"
                  : "rgb(var(--color-fg) / 0.7)",
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                letterSpacing: "0.08em",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
            >
              {t.label.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* ---- Body ---- */}
      {loading ? (
        <p style={{ opacity: 0.55, fontFamily: "var(--font-mono)" }}>
          Loading leaderboard…
        </p>
      ) : errored ? (
        <p style={{ color: "#ED445A", fontFamily: "var(--font-mono)" }}>
          Could not load leaderboard.
        </p>
      ) : !rows || rows.length === 0 ? (
        <EmptyState scope={active} />
      ) : (
        <LeaderboardTable rows={rows} scope={active} />
      )}
    </div>
  );
}

function LeaderboardTable({
  rows,
  scope,
}: {
  rows: AggregateRow[];
  scope: Tab["key"];
}) {
  return (
    <div
      style={{
        border: "1px solid rgb(var(--color-border))",
        background: "rgb(var(--color-surface))",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px 1fr 100px 100px 90px",
          gap: 12,
          padding: "12px 18px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgb(var(--color-fg) / 0.5)",
          borderBottom: "1px solid rgb(var(--color-border))",
        }}
      >
        <span>Rank</span>
        <span>Player</span>
        <span style={{ textAlign: "right" }}>Games</span>
        <span style={{ textAlign: "right" }}>Bonus</span>
        <span style={{ textAlign: "right" }}>Points</span>
      </div>
      {rows.map((r) => {
        const champ = r.rank === 1;
        return (
          <div
            key={r.user_address}
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr 100px 100px 90px",
              gap: 12,
              padding: "12px 18px",
              alignItems: "center",
              borderTop: "1px solid rgb(var(--color-border) / 0.5)",
              background: champ ? "rgba(255, 199, 44, 0.06)" : "transparent",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                color: champ
                  ? "var(--skill-yellow)"
                  : "rgb(var(--color-fg) / 0.7)",
                fontSize: champ ? 18 : 14,
              }}
            >
              {champ ? "👑" : `#${r.rank}`}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                color: champ ? "var(--skill-yellow)" : "rgb(var(--color-fg))",
                fontSize: 13,
              }}
            >
              {SHORT(r.user_address)}
            </span>
            <span
              style={{
                textAlign: "right",
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                fontSize: 12,
                color: "rgb(var(--color-fg) / 0.7)",
              }}
            >
              {r.games_played}
            </span>
            <span
              style={{
                textAlign: "right",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: r.multi_game_bonus_applied
                  ? "#34D378"
                  : "rgb(var(--color-fg) / 0.3)",
              }}
            >
              {r.multi_game_bonus_applied ? "×1.5" : "—"}
            </span>
            <span
              style={{
                textAlign: "right",
                fontFamily: "var(--font-sans)",
                fontSize: 18,
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
                color: champ ? "var(--skill-yellow)" : "rgb(var(--color-fg))",
              }}
            >
              {r.total_points}
            </span>
          </div>
        );
      })}
      <div
        style={{
          padding: "12px 18px",
          borderTop: "1px solid rgb(var(--color-border))",
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          color: "rgb(var(--color-fg) / 0.5)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Scope: {scope === "overall" ? "Overall (all 20 games)" : scope}
      </div>
    </div>
  );
}

function EmptyState({ scope }: { scope: Tab["key"] }) {
  const isOverall = scope === "overall";
  return (
    <div
      style={{
        border: "1px dashed rgb(var(--color-border))",
        borderRadius: 8,
        padding: "32px 24px",
        textAlign: "center",
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        color: "rgb(var(--color-fg) / 0.6)",
        lineHeight: 1.7,
      }}
    >
      <p style={{ margin: 0, fontSize: 14 }}>
        No {isOverall ? "overall" : scope} ranks computed yet today.
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 11.5, opacity: 0.6 }}>
        Aggregate snapshot runs nightly via the payout cron — or on-demand via
        the studio.
      </p>
    </div>
  );
}
