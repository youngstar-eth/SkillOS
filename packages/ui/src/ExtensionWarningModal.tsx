"use client";

// ───────────────────────────────────────────────────────────────────────────
// ExtensionWarningModal — X14.1 soft warning for non-whitelisted wallet
// connectors on human-only tournaments.
//
// Renders only when `profile.enforced && !profile.allowed`. Dismissible —
// X14.1 is advisory per docs/sprints/x14-class-fairness/SCOPING.md §4.2
// (Q-4 default = soft warning + log, no hard block). The user may
// dismiss and continue submitting; the X-Extension-Profile header still
// rides along on subsequent submit fetches as the server audit channel.
//
// No portal, no overlay — sits inline above the tournament action area
// so it's hard to miss but doesn't block the rest of the page. This
// matches the PopupHint precedent of preventive copy near the trigger.
// ───────────────────────────────────────────────────────────────────────────

import { useState } from "react";

import type { ExtensionProfile } from "./extension-whitelist";

export interface ExtensionWarningModalProps {
  profile: ExtensionProfile;
}

export function ExtensionWarningModal({ profile }: ExtensionWarningModalProps) {
  const [dismissed, setDismissed] = useState(false);
  if (!profile.enforced || profile.allowed || dismissed) return null;

  const detected = profile.detected ?? "unknown wallet";

  return (
    <div
      role="alert"
      className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-[12px] leading-relaxed text-amber-100"
    >
      <p>
        <span className="font-semibold">Human-only tournament.</span> Detected
        connector{" "}
        <span className="font-mono text-amber-200">{detected}</span> is not on
        the recommended whitelist (MetaMask, Coinbase Wallet, Base Account,
        Rabby). You can still play — submissions from non-whitelisted
        connectors are flagged for review in line with the tournament class
        declaration.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="mt-2 text-[11px] text-amber-300/80 underline-offset-2 hover:underline"
      >
        dismiss
      </button>
    </div>
  );
}
