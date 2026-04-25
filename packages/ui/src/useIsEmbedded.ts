"use client";

// ───────────────────────────────────────────────────────────────────────────
// useIsEmbedded — synchronous heuristic detection of "we're inside a Mini App
// embed" (Base App in-app browser, Warpcast Mini App webview, or any iframe
// wrapper). No SDK, no Provider, no async — picks up signals from the
// runtime environment after first render.
//
// Why heuristic, not @farcaster/miniapp-sdk: the SDK install adds a
// Provider-level dependency that can crash root rendering on standalone web
// if init throws. For Tier C-min the goal is "hide chrome in embed" — we
// don't need the FID, social graph, or actions API. Three free signals
// (iframe, UA, referrer) cover the cases that matter, with zero blast
// radius. If a future Tier C-mid wants composeCast / SIWF / FID identity,
// upgrade to the SDK behind a feature flag — this hook stays usable as
// the synchronous fallback.
//
// SSR-safe: returns false on first render (server has no window), then
// re-evaluates in useEffect on the client. A standalone-web user gets one
// extra render with `embedded=false` (which is correct anyway). An embed
// user gets one render of standalone-chrome before it disappears — that
// flicker is acceptable for Tier C-min and removable later by gating
// chrome rendering on a known-result tri-state if needed.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

export function useIsEmbedded(): boolean {
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    try {
      const inIframe = window.parent !== window;

      const ua = navigator.userAgent || "";
      const userAgentHint = /Warpcast|Base ?App|Farcaster/i.test(ua);

      let refererHint = false;
      try {
        const r = document.referrer || "";
        refererHint = /warpcast|farcaster|base\.app/i.test(r);
      } catch {
        refererHint = false;
      }

      setEmbedded(inIframe || userAgentHint || refererHint);
    } catch {
      setEmbedded(false);
    }
  }, []);

  return embedded;
}
