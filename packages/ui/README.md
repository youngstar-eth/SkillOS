# @skillbase/ui

Shared React components and design primitives consumed by every game app and the sponsor app.

## Exports

- `Header`, `Nav` — top-bar with Skillbase brand + per-app slot
- `Providers` — wagmi + react-query + theme provider stack
- `SkillbaseMark` — canonical brand monogram (SVG, sized via prop)
- `ModeChooser` — solo / duel mode toggle (duel disabled in Phase 2)
- `DuelComingSoon` — `<DuelComingSoon />` placeholder served at every `/duel/*` route while duels are paused for Phase 2
- `Timer`, `PopupHint`, `AddressDisplay`, `EmbedWalletFallback`, `ReadyMarker` — utility primitives
- `og/game-card` — `next/og`-compatible OG image renderer (subpath export, server-only)

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
