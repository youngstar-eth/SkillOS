"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./utils";

/**
 * Countdown timer to a UTC ISO deadline. Displays M:SS.
 *
 * Clock-drift note: server owns `deadline` (UTC ISO). Client subtracts
 * `Date.now()` — if the user's clock is skewed a few seconds ahead, the
 * timer appears to expire early; if behind, late. The parent guards the
 * submit fire with a ref so a late client expire is still a valid submit
 * and the server will reject any submit past its own `ends_at` anyway.
 */
export function Timer({
  deadline,
  onExpire,
}: {
  deadline: string | null | undefined;
  onExpire?: () => void;
}) {
  // Start "now" equal to the deadline so SSR + initial-hydration render
  // the same "--:--" placeholder instead of producing differing M:SS values
  // from Date.now() on two machines. Real ticking starts in the useEffect.
  const [now, setNow] = useState<number | null>(null);
  const expiredRef = useRef(false);

  // Reset the one-shot guard when the deadline changes (e.g. restart).
  useEffect(() => {
    expiredRef.current = false;
  }, [deadline]);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const end = deadline ? new Date(deadline).getTime() : null;
  const remainingMs =
    end === null || now === null ? null : Math.max(0, end - now);
  const expired =
    end !== null && remainingMs !== null && remainingMs === 0;

  useEffect(() => {
    if (expired && !expiredRef.current) {
      expiredRef.current = true;
      onExpire?.();
    }
  }, [expired, onExpire]);

  const displayMs = remainingMs ?? 0;
  const mins = Math.floor(displayMs / 60_000);
  const secs = Math.floor((displayMs % 60_000) / 1000);
  const danger =
    remainingMs !== null && remainingMs < 15_000 && remainingMs > 0;

  return (
    <div
      className={cx(
        "rounded-lg border px-3 py-1.5 font-mono text-lg font-semibold tabular-nums",
        danger
          ? "border-red-500/50 bg-red-500/10 text-red-300"
          : "border-border bg-bg-elev text-neutral-100",
      )}
      aria-live="polite"
      // Suppress hydration warnings on the countdown text itself — it
      // *must* differ between server render and client time.
      suppressHydrationWarning
    >
      {end === null || remainingMs === null
        ? "--:--"
        : `${mins}:${secs.toString().padStart(2, "0")}`}
    </div>
  );
}
