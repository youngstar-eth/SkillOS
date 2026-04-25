"use client";

// ───────────────────────────────────────────────────────────────────────────
// useMiniAppReady — single-shot Mini App lifecycle handshake.
//
// When Skillbase loads inside Warpcast / Base App, the host shows a splash
// screen and waits for the embedded app to call sdk.actions.ready() to
// signal "first paint complete, dismiss the splash." Without this call the
// splash persists forever (Warpcast Apps panel reports the warning).
//
// Implementation notes:
//   - Dynamic import of @farcaster/miniapp-sdk so the SDK ships in a chunk
//     that's only fetched at runtime, keeping the initial bundle small for
//     standalone-web users who never need it.
//   - sdk.isInMiniApp() before sdk.actions.ready() so standalone web is a
//     no-op (the SDK's ready() in non-embed contexts is a benign no-op too,
//     but gating saves the network round-trip and keeps the call site
//     intent obvious).
//   - All errors swallowed silently. SDK failure on standalone web is the
//     expected case; we don't want to surface a Mini-App SDK error to a
//     user who isn't even in a Mini App.
//   - mounted flag prevents calling ready() after unmount (StrictMode
//     double-invocation safety + race condition between dynamic import
//     and component teardown).
//
// Tier C-min uses a separate heuristic for chrome-hiding (useIsEmbedded).
// This hook intentionally does NOT replace it — they answer different
// questions: useIsEmbedded is "should we hide standalone chrome", this
// hook is "tell the host we're done loading." Both can fire on the same
// page.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";

export function useMiniAppReady(): void {
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        if (!mounted) return;
        const inMiniApp = await sdk.isInMiniApp().catch(() => false);
        if (!mounted || !inMiniApp) return;
        await sdk.actions.ready();
      } catch {
        // Standalone web context — SDK init failed or no Mini App host.
        // No-op silently; this hook is best-effort.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
}
