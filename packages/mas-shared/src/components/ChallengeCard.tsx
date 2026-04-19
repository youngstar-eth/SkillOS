"use client";

import type { Challenge } from "../challenge/types";

export interface ChallengeCardProps {
  challenge: Challenge;
  /** Click handler fallback when there's no href. */
  onClick?: () => void;
  href?: string;
}

export function ChallengeCard({ challenge, onClick, href }: ChallengeCardProps) {
  const c = challenge;
  const now = Date.now();
  const remainingMs = new Date(c.expires_at).getTime() - now;
  const remaining =
    remainingMs <= 0
      ? "expired"
      : remainingMs < 3600_000
        ? `${Math.ceil(remainingMs / 60_000)}m`
        : remainingMs < 86_400_000
          ? `${Math.ceil(remainingMs / 3_600_000)}h`
          : `${Math.ceil(remainingMs / 86_400_000)}d`;

  const body = (
    <>
      <div
        style={{
          fontSize: 10,
          opacity: 0.6,
          letterSpacing: "0.2em",
          marginBottom: 4,
        }}
      >
        {c.game_slug.toUpperCase()}
      </div>
      <div style={{ fontSize: 14, marginBottom: 4 }}>
        beat <b>{c.creator_score}</b>
      </div>
      <div
        style={{
          fontSize: 10,
          opacity: 0.6,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          {c.creator_address.slice(0, 6)}…{c.creator_address.slice(-4)}
        </span>
        <span>
          {c.stake_usdc} USDC · {remaining}
        </span>
      </div>
    </>
  );

  const style: React.CSSProperties = {
    padding: "10px 12px",
    border: "1px solid rgba(255,199,44,0.25)",
    background: "rgba(255,199,44,0.03)",
    color: "#FFC72C",
    fontFamily: "monospace",
    textDecoration: "none",
    display: "block",
    cursor: "pointer",
  };

  if (href) {
    return (
      <a href={href} style={style}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} style={{ ...style, width: "100%", textAlign: "left" }}>
      {body}
    </button>
  );
}
