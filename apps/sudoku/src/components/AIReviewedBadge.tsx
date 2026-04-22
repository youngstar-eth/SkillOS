"use client";

// ───────────────────────────────────────────────────────────────────────────
// AIReviewedBadge — small trust-signal pill near the score card.
//
// Fetches GET /api/duel/[id]/plausibility on mount. The public endpoint
// always returns one of:
//   { status: "pending" }                           → show subdued "Reviewing…"
//   { status: "reviewed", reviewedAt: ISO string }  → show green "AI Reviewed ✓"
//
// Polling: settle fires the anti-cheat audit asynchronously with a ~2-5s
// Haiku latency. If the user opens the result page before the audit
// completes, the first response is "pending". We retry ONCE after 5s;
// after either a "reviewed" response or a second "pending" we stop
// polling forever for this mount. The result page is usually open for
// longer than one Haiku round-trip, so two chances is enough for the
// hot path.
//
// Error handling: hidden silently. The badge is an enhancement, and
// showing "audit failed" to a user who just won money would undermine
// the trust it's meant to build. Admins see the NULL row via the flag
// queue's absence; users see nothing.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

type PlausibilityStatus =
  | { status: "pending" }
  | { status: "reviewed"; reviewedAt: string };

type Props = {
  matchId: string;
};

async function fetchPlausibility(
  matchId: string,
): Promise<PlausibilityStatus> {
  const res = await fetch(`/api/duel/${matchId}/plausibility`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as PlausibilityStatus;
}

export function AIReviewedBadge({ matchId }: Props) {
  const { data, isError, refetch } = useQuery<PlausibilityStatus>({
    queryKey: ["plausibility", matchId],
    queryFn: () => fetchPlausibility(matchId),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  // Poll exactly once more after 5s if still pending — Haiku's async
  // audit usually lands in that window.
  useEffect(() => {
    if (data?.status !== "pending") return;
    const t = setTimeout(() => {
      refetch();
    }, 5000);
    return () => clearTimeout(t);
  }, [data, refetch]);

  if (isError) return null;
  // Initial render (before first response) — render nothing to avoid a
  // flicker from "nothing" → "reviewing" → "reviewed" in the fast path.
  if (!data) return null;

  if (data.status === "pending") {
    return (
      <div className="flex justify-center">
        <div
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-500"
          title="Anti-cheat audit in progress…"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500" />
          Reviewing…
        </div>
      </div>
    );
  }

  // status === "reviewed"
  return (
    <div className="flex justify-center">
      <div className="group relative inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/5 px-3 py-1 text-xs font-medium text-green-400">
        <CheckIcon />
        AI Reviewed
        <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-800 px-2 py-1 text-[10px] text-neutral-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          Match plausibility verified by Claude Haiku
        </span>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="12"
      height="12"
      aria-hidden
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
