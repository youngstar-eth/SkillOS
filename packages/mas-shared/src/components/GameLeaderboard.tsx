"use client";

import { useEffect, useState } from "react";

export interface GameLeaderboardProps {
  /** Game slug — only used for the API path (the route is slug-bound). */
  gameSlug: string;
  /** Day in YYYY-MM-DD; defaults to today. */
  day?: string;
  /** Max rows to show. */
  limit?: number;
  /** Highlight this address in the table (the connected wallet). */
  highlightAddress?: string;
  /** Optional title override. */
  title?: string;
}

interface Entry {
  user_address: string;
  rank: number;
  best_score: number;
  rank_points: number;
}

const SHORT = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Reads `/api/leaderboard-tiered?day=...&limit=...` (slug-bound on each game).
 * Renders a tight terminal-style table that drops into both the wordle
 * (Skill Yellow accent) and 2048/hillclimb (custom accent) skins via
 * CSS variables. Pure inline styles to stay theme-portable.
 */
export function GameLeaderboard({
  gameSlug,
  day,
  limit = 10,
  highlightAddress,
  title,
}: GameLeaderboardProps) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const lcHighlight = highlightAddress?.toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(false);

    const params = new URLSearchParams();
    if (day) params.set("day", day);
    params.set("limit", String(limit));

    fetch(`/api/leaderboard-tiered?${params.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as { leaderboard: Entry[] };
      })
      .then((d) => {
        if (!cancelled) setEntries(d.leaderboard);
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
  }, [gameSlug, day, limit]);

  return (
    <section
      aria-label={`${gameSlug} leaderboard`}
      style={{
        marginTop: 16,
        padding: "12px 14px",
        border: "1px solid rgb(var(--color-border, 55 57 62))",
        background: "rgb(var(--color-surface, 28 29 32))",
        borderRadius: 6,
        fontFamily:
          "var(--font-mono, ui-monospace, Menlo, Consolas, monospace)",
        fontSize: 12,
        color: "rgb(var(--color-fg, 255 255 255))",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "rgb(var(--color-fg, 255 255 255) / 0.55)",
        }}
      >
        <span>{title ?? "Today's leaderboard"}</span>
        {entries ? <span>{entries.length} players</span> : null}
      </header>

      {loading ? (
        <p style={{ margin: 0, opacity: 0.55 }}>Loading…</p>
      ) : errored ? (
        <p style={{ margin: 0, opacity: 0.55 }}>Leaderboard unavailable.</p>
      ) : !entries || entries.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.55 }}>
          No scores yet today. Be first.
        </p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            <col style={{ width: 40 }} />
            <col />
            <col style={{ width: 90 }} />
            <col style={{ width: 50 }} />
          </colgroup>
          <thead>
            <tr
              style={{
                fontSize: 9.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgb(var(--color-fg, 255 255 255) / 0.45)",
              }}
            >
              <th style={cellHead}>Rank</th>
              <th style={{ ...cellHead, textAlign: "left" }}>Player</th>
              <th style={{ ...cellHead, textAlign: "right" }}>Score</th>
              <th style={{ ...cellHead, textAlign: "right" }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const isMe = lcHighlight && e.user_address === lcHighlight;
              return (
                <tr
                  key={e.user_address}
                  style={{
                    background: isMe
                      ? "rgba(255, 199, 44, 0.08)"
                      : "transparent",
                    color: isMe
                      ? "#FFC72C"
                      : "rgb(var(--color-fg, 255 255 255) / 0.85)",
                  }}
                >
                  <td style={cell}>
                    {e.rank === 1 ? (
                      <span title="Champion">👑</span>
                    ) : (
                      <span style={{ opacity: 0.7 }}>#{e.rank}</span>
                    )}
                  </td>
                  <td style={{ ...cell, textAlign: "left" }}>
                    {SHORT(e.user_address)}
                    {isMe ? <span style={{ marginLeft: 6 }}>· you</span> : null}
                  </td>
                  <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {e.best_score.toLocaleString()}
                  </td>
                  <td
                    style={{
                      ...cell,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color:
                        e.rank_points > 0
                          ? "#FFC72C"
                          : "rgb(var(--color-fg, 255 255 255) / 0.35)",
                    }}
                  >
                    {e.rank_points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

const cell: React.CSSProperties = {
  padding: "6px 6px",
  borderTop: "1px solid rgb(var(--color-border, 55 57 62) / 0.5)",
  textAlign: "center",
  fontSize: 12,
};
const cellHead: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid rgb(var(--color-border, 55 57 62))",
  textAlign: "center",
  fontWeight: 600,
};
