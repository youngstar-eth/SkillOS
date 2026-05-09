# @skillbase/ui

Shared React components and design primitives consumed by every game app and the sponsor app.

## Exports

- `Header` — top-bar with SkillOS brand + per-app slot
- `Providers` — wagmi + react-query + theme provider stack
- `wagmiConfig` — pre-configured wagmi client
- `WalletButton`, `EmbedWalletFallback` — wallet connect UI (with miniapp-aware fallback)
- `SkillOSWordmark` — canonical SkillOS brand wordmark (Inter 700, -0.022em letter-spacing; mirrors apex `Wordmark`)
- `ModeChooser` — solo / duel mode toggle (duel disabled in Phase 2)
- `DuelComingSoon` — `<DuelComingSoon />` placeholder served at every `/duel/*` route while duels are paused for Phase 2
- `Timer`, `PopupHint`, `AddressDisplay`, `ReadyMarker` — utility primitives
- `useBasename`, `useIsEmbedded`, `useMiniAppReady`, `useSoloRetry` — React hooks
- `COACH_MODEL_DISPLAY`, `RECAP_MODEL_DISPLAY`, `ANTICHEAT_MODEL_DISPLAY` — model labels for AI attribution

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
