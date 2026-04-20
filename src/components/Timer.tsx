"use client";

import { useEffect, useState } from "react";
import { cx } from "@/lib/utils";

/**
 * Countdown timer to a UTC ISO deadline. Displays M:SS.
 * Calls onExpire once when remaining <= 0.
 */
export function Timer({
  deadline,
  onExpire,
}: {
  deadline: string | null | undefined;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const end = deadline ? new Date(deadline).getTime() : null;
  const remainingMs = end ? Math.max(0, end - now) : 0;
  const expired = end !== null && remainingMs === 0;

  useEffect(() => {
    if (expired) onExpire?.();
    // only fire once — parent should gate via ref
  }, [expired, onExpire]);

  const mins = Math.floor(remainingMs / 60_000);
  const secs = Math.floor((remainingMs % 60_000) / 1000);
  const danger = remainingMs < 15_000 && remainingMs > 0;

  return (
    <div
      className={cx(
        "rounded-lg border px-3 py-1.5 font-mono text-lg font-semibold tabular-nums",
        danger
          ? "border-red-500/50 bg-red-500/10 text-red-300"
          : "border-border bg-bg-elev text-neutral-100",
      )}
      aria-live="polite"
    >
      {end === null ? "--:--" : `${mins}:${secs.toString().padStart(2, "0")}`}
    </div>
  );
}
