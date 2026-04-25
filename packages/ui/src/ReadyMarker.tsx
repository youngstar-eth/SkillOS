"use client";

// ───────────────────────────────────────────────────────────────────────────
// ReadyMarker — render-null component that fires the Mini App readiness
// handshake exactly once per page mount. Drop it anywhere in a layout or
// page tree and the host will dismiss its splash on first paint.
//
// Why a separate component instead of inlining useMiniAppReady() in
// <Header />: Header returns null when useIsEmbedded() is true (Tier
// C-min), so a hook called from Header wouldn't run in the very context
// where ready() matters most. ReadyMarker has no conditional rendering,
// so the effect always fires — embed or not.
// ───────────────────────────────────────────────────────────────────────────

import { useMiniAppReady } from "./useMiniAppReady";

export function ReadyMarker(): null {
  useMiniAppReady();
  return null;
}
