"use client";

import { useEffect, useState } from "react";

export interface DailyChallenge {
  id: string;
  game_slug: string;
  challenge_date: string;
  theme: string;
  challenge_data: unknown;
  ai_description: string;
}

export interface DailyChallengeBannerProps {
  /** Game slug — used as `?game=...` on /api/daily. */
  gameSlug: string;
  /** Called when the user taps "Play Daily". Passed the fetched challenge. */
  onPlay?: (challenge: DailyChallenge) => void;
  /** If true, the play button is disabled (e.g. user not yet wallet-connected). */
  playDisabled?: boolean;
  /** Label for the play CTA. */
  playLabel?: string;
}

/**
 * Fetches today's AI-curated challenge from `/api/daily?game=<slug>` and
 * renders a Skill-Yellow-tinted banner above the game. Falls back silently
 * (renders nothing) if there is no challenge today.
 */
export function DailyChallengeBanner({
  gameSlug,
  onPlay,
  playDisabled,
  playLabel = "Play Daily →",
}: DailyChallengeBannerProps) {
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/daily?game=${encodeURIComponent(gameSlug)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as DailyChallenge;
      })
      .then((data) => {
        if (cancelled) return;
        setChallenge(data);
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
  }, [gameSlug]);

  if (loading || errored || !challenge) return null;

  return (
    <section
      aria-label="Today's AI-curated challenge"
      style={{
        border: "1px solid rgba(255, 199, 44, 0.35)",
        background:
          "linear-gradient(180deg, rgba(255,199,44,0.07), rgba(255,199,44,0.02))",
        borderRadius: 8,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: "var(--font-mono, ui-monospace, Menlo, monospace)",
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "#FFC72C",
        }}
      >
        <span
          style={{
            width: 22,
            height: 1,
            background: "#FFC72C",
          }}
        />
        Today&rsquo;s challenge · ai-curated
      </div>

      <h3
        style={{
          margin: 0,
          fontSize: 20,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          fontWeight: 700,
        }}
      >
        {challenge.theme}
      </h3>

      <p
        style={{
          margin: 0,
          fontSize: 13.5,
          lineHeight: 1.55,
          opacity: 0.78,
        }}
      >
        {challenge.ai_description}
      </p>

      {onPlay ? (
        <button
          type="button"
          onClick={() => onPlay(challenge)}
          disabled={playDisabled}
          style={{
            alignSelf: "flex-start",
            marginTop: 4,
            height: 36,
            padding: "0 16px",
            borderRadius: 6,
            border: 0,
            background: "#FFC72C",
            color: "#0A0B0D",
            fontFamily:
              "var(--font-sans, 'Inter', 'Helvetica Neue', Arial, sans-serif)",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "-0.01em",
            cursor: playDisabled ? "not-allowed" : "pointer",
            opacity: playDisabled ? 0.5 : 1,
            transition: "opacity 200ms cubic-bezier(0.2,0.8,0.2,1)",
          }}
        >
          {playLabel}
        </button>
      ) : null}
    </section>
  );
}
