// ───────────────────────────────────────────────────────────────────────────
// @skillbase/ui — client-side React components + browser utilities.
//
// Safe to import from client components in any app/*.
// ───────────────────────────────────────────────────────────────────────────

export * from "./utils";
export * from "./api-client";
export { wagmiConfig } from "./wagmi";
export { Providers } from "./Providers";
export { Timer } from "./Timer";
export { WalletButton } from "./WalletButton";
export { PopupHint, type PopupHintProps } from "./PopupHint";
export { AddressDisplay, type AddressDisplayProps } from "./AddressDisplay";
export {
  useBasename,
  type BasenameStatus,
  type UseBasenameReturn,
} from "./useBasename";
export { splashTemplate, type SplashProps } from "./og";
// NOTE: og/game-card is server-only (imports next/og → uses Node `fs`).
// Re-exporting it from this client-safe barrel contaminates client
// bundles (Next 14 webpack can't tree-shake across package boundaries
// reliably). Consumers import it directly via the subpath:
//   import { gameOgImage } from "@skillbase/ui/og/game-card";
export { ModeChooser, type ModeChooserProps } from "./ModeChooser";
export { DuelComingSoon } from "./DuelComingSoon";
export {
  selectDuelResultBranch,
  type DuelResultBranch,
  type DuelResultBranchInput,
} from "./duel-result-branch";
export {
  DuelResultCard,
  type DuelResultCardProps,
} from "./DuelResultCard";
export { useIsEmbedded } from "./useIsEmbedded";
export { Header, type HeaderProps } from "./Header";
export { SkillbaseMark, type SkillbaseMarkProps } from "./SkillbaseMark";
export { SoloResultCard, type SoloResultCardProps } from "./SoloResultCard";
export { useMiniAppReady } from "./useMiniAppReady";
export { ReadyMarker } from "./ReadyMarker";
export { EmbedWalletFallback } from "./EmbedWalletFallback";
export {
  COACH_MODEL_DISPLAY,
  RECAP_MODEL_DISPLAY,
  ANTICHEAT_MODEL_DISPLAY,
} from "./models";
export {
  useSoloRetry,
  type UseSoloRetryStatus,
  type UseSoloRetryParams,
  type UseSoloRetryReturn,
  type SoloEligibility,
  type SoloSubmitResponse,
} from "./useSoloRetry";
