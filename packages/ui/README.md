# @skillbase/ui

Shared React components and design primitives consumed by every game app and the sponsor app.

## Exports

- `Header` — top-bar with SkillOS brand + per-app slot
- `Providers` — wagmi + react-query + theme provider stack
- `wagmiConfig` — pre-configured wagmi client
- `WalletButton`, `EmbedWalletFallback` — wallet connect UI (with miniapp-aware fallback)
- `SkillosMark` — canonical brand monogram (SVG, sized via prop)
- `ModeChooser` — solo / duel mode toggle (duel disabled in Phase 2)
- `DuelComingSoon` — `<DuelComingSoon />` placeholder served at every `/duel/*` route while duels are paused for Phase 2
- `Timer`, `PopupHint`, `AddressDisplay`, `ReadyMarker` — utility primitives
- `useBasename`, `useIsEmbedded`, `useMiniAppReady`, `useSoloRetry` — React hooks
- `splashTemplate` — JSX template for the per-app `splash.png` route (client-safe; consumed by `next/og`'s `ImageResponse`)
- `COACH_MODEL_DISPLAY`, `RECAP_MODEL_DISPLAY`, `ANTICHEAT_MODEL_DISPLAY` — model labels for AI attribution
- Subpath `@skillbase/ui/og/game-card` — `next/og`-compatible OG image renderer (server-only); exposes `gameOgImage`, `GameOgCard`, `TileGlyph`

## Subpath exports

The package ships two entry points:

- `@skillbase/ui` — client-safe barrel (no `next/og`, no Node `fs`)
- `@skillbase/ui/og/game-card` — server-only, used by per-app `/opengraph-image.tsx` routes

Mixing them in a single file will break webpack bundling for client components — keep `og/game-card` imports inside `opengraph-image.tsx` routes only.

## Usage

```tsx
import { Header, Providers } from "@skillbase/ui";

export default function Layout({ children }) {
  return (
    <Providers>
      <Header app="2048" />
      {children}
    </Providers>
  );
}
```
