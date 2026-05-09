// ───────────────────────────────────────────────────────────────────────────
// splashTemplate — 512×512 launch splash served at /splash.png. Shown by
// Base App / Warpcast clients while a Mini App is bootstrapping. Brand
// styling: dark bg, brand+gold radial wash, SkillosMark wordmark glyph.
// The game/app name is the only varying string.
//
// (The companion `gameOgTemplate` previously lived here too. After PR #3
// it was superseded by `GameOgCard` + `gameOgImage` at the
// `@skillbase/ui/og/game-card` subpath, which uses Satori-native rendering
// with TileGlyph for per-game art. This file now hosts splash logic only.)
// ───────────────────────────────────────────────────────────────────────────

import type { ReactElement } from "react";
import { SkillosMark } from "./SkillosMark";

const SANS_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export interface SplashProps {
  /** Game/app name shown under the wordmark, e.g. "2048" or "SkillOS". */
  name: string;
}

export function splashTemplate({ name }: SplashProps): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        fontFamily: SANS_FONT_STACK,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 30% 30%, rgba(0, 82, 255, 0.32), transparent 65%), radial-gradient(circle at 75% 75%, rgba(221, 172, 47, 0.30), transparent 60%)",
          filter: "blur(80px)",
        }}
      />
      <div style={{ display: "flex", zIndex: 1 }}>
        <SkillosMark size={140} style={{ display: "block" }} />
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 32,
          fontSize: 44,
          fontWeight: 700,
          color: "#ffffff",
          letterSpacing: "-0.03em",
          zIndex: 1,
        }}
      >
        skillbase
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 8,
          fontSize: 22,
          color: "#A1A1AA",
          fontWeight: 500,
          letterSpacing: "0.06em",
          zIndex: 1,
        }}
      >
        {name}
      </div>
    </div>
  );
}
