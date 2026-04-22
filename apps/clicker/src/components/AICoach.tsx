"use client";

// ───────────────────────────────────────────────────────────────────────────
// AICoach — post-match feedback card.
//
// Fetches POST /api/duel/[id]/coach on mount. The server generates the
// response on first call and caches it (v2_duels.coach_cache); subsequent
// mounts for the same (matchId, player) return the cached row instantly.
//
// States:
//   • loading  — skeleton lines + "Analyzing your match…"
//   • ready    — styled feedback card with tone badge
//   • error    — soft fallback message, no crash
// ───────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import type { CoachResponse, CoachTone } from "@skillbase/ai-coach";

type Props = {
  matchId: string;
  player: `0x${string}`;
};

async function fetchCoach(
  matchId: string,
  player: string,
): Promise<CoachResponse> {
  const res = await fetch(`/api/duel/${matchId}/coach`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ player }),
  });
  if (!res.ok) {
    // Surface the structured error body when available — helps debugging
    // without needing to crack the browser devtools network panel.
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.error) detail = `${body.error}: ${body.message ?? ""}`.trim();
    } catch {
      /* non-JSON error body; keep the HTTP-status detail. */
    }
    throw new Error(detail);
  }
  return (await res.json()) as CoachResponse;
}

// Tone → small-caps label + swatch color. Using border + text colors
// rather than fills so the badge sits inside the card without visual
// weight. Fallback to neutral for encouraging / unknown tones.
const TONE_STYLES: Record<CoachTone, { label: string; cls: string }> = {
  tactical: {
    label: "Tactical",
    cls: "border-yellow-500/40 text-yellow-300",
  },
  analytical: {
    label: "Analytical",
    cls: "border-blue-500/40 text-blue-300",
  },
  technique: {
    label: "Technique",
    cls: "border-purple-500/40 text-purple-300",
  },
  risk: {
    label: "Risk",
    cls: "border-orange-500/40 text-orange-300",
  },
  pacing: {
    label: "Pacing",
    cls: "border-green-500/40 text-green-300",
  },
  strategic: {
    label: "Strategic",
    cls: "border-indigo-500/40 text-indigo-300",
  },
  encouraging: {
    label: "Coach",
    cls: "border-neutral-500/40 text-neutral-300",
  },
};

export function AICoach({ matchId, player }: Props) {
  const { data, isLoading, isError } = useQuery<CoachResponse>({
    queryKey: ["coach", matchId, player],
    queryFn: () => fetchCoach(matchId, player),
    // Cached server-side — once we have a response it won't change. No
    // point in refetching on focus, reconnect, or background intervals.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  return (
    <div className="rounded-2xl border border-border bg-bg-elev p-6">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          🤖 AI Coach
        </p>
        {data && (
          <span
            className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${TONE_STYLES[data.tone].cls}`}
          >
            {TONE_STYLES[data.tone].label}
          </span>
        )}
      </div>

      <div className="mt-4 min-h-[72px]">
        {isLoading && (
          <div className="space-y-2" aria-live="polite" aria-busy="true">
            <div className="h-3 w-11/12 animate-pulse rounded bg-neutral-700/60" />
            <div className="h-3 w-10/12 animate-pulse rounded bg-neutral-700/60" />
            <div className="h-3 w-7/12 animate-pulse rounded bg-neutral-700/60" />
            <p className="pt-2 text-xs text-neutral-500">
              Analyzing your match…
            </p>
          </div>
        )}

        {isError && (
          <p className="text-sm text-neutral-400">
            Coach unavailable. Try again later.
          </p>
        )}

        {data && (
          <p className="text-sm leading-relaxed text-neutral-200">
            {data.feedback}
          </p>
        )}
      </div>

      <p className="mt-4 text-[10px] tracking-wider text-neutral-600">
        Powered by Claude Haiku
      </p>
    </div>
  );
}
