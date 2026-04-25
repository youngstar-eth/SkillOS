"use client";

// ───────────────────────────────────────────────────────────────────────────
// PopupHint — preventive copy for the 2-tx pay-then-play flow.
//
// The pay path fires TWO wallet popups: USDC.approve, then chargeRetryFee.
// Popup #1 fires synchronously inside the click handler (user-gesture
// context — Chrome always allows). Popup #2 fires from a useEffect that
// runs after the approve receipt mines — by then the user-gesture
// context is gone, and Chrome's default popup blocker can silently
// suppress it. The user sees "Settling fee on-chain…" and waits forever.
//
// We do NOT detect popup-blocker state with a window.open probe:
//   1. Probing inside the initial click runs in user-gesture context, so
//      it will report "allowed" even when popup #2 will later be blocked.
//      The probe can't see the bug we're trying to surface.
//   2. Probes give false positives in fringe browsers, which would block
//      legitimate users from playing.
//
// Instead we show this preventive hint near the Pay button and inside the
// "paying" panel, so the user knows what to do if the wallet doesn't open.
// Dismissible via component-local state (resets on remount — no
// localStorage — because next session may be on a different browser/device).
// ───────────────────────────────────────────────────────────────────────────

import { useState } from "react";

export interface PopupHintProps {
  /**
   * "subtle" — small footnote under the Pay button (idle state).
   * "stuck"  — louder warning shown inside the "paying" panel, where the
   *            user is actively waiting for popup #2 and may be blocked.
   */
  variant?: "subtle" | "stuck";
}

export function PopupHint({ variant = "subtle" }: PopupHintProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  if (variant === "stuck") {
    return (
      <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] leading-relaxed text-amber-200">
        <p>
          <span className="font-semibold">Wallet didn&apos;t open?</span> This
          step needs a second popup. If your browser blocked it, click the
          popup icon (🔒 or 🚫) in the address bar and allow popups for this
          site, then press Reset and try again.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="mt-1 text-[10px] text-amber-300/70 underline-offset-2 hover:underline"
        >
          dismiss
        </button>
      </div>
    );
  }

  return (
    <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
      Heads up: paid retries open <span className="text-neutral-300">two</span>{" "}
      wallet popups. If the second doesn&apos;t appear, allow popups for this
      site in your browser&apos;s address bar.{" "}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-neutral-400 underline-offset-2 hover:underline"
      >
        got it
      </button>
    </p>
  );
}
