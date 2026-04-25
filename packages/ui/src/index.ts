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
export {
  gameOgTemplate,
  type GameOgProps,
  splashTemplate,
  type SplashProps,
} from "./og";
export { ModeChooser, type ModeChooserProps } from "./ModeChooser";
export { DuelComingSoon } from "./DuelComingSoon";
export { useIsEmbedded } from "./useIsEmbedded";
export { Header, type HeaderProps } from "./Header";
export { useMiniAppReady } from "./useMiniAppReady";
export { ReadyMarker } from "./ReadyMarker";
export {
  useSoloRetry,
  type UseSoloRetryStatus,
  type UseSoloRetryParams,
  type UseSoloRetryReturn,
  type SoloEligibility,
  type SoloSubmitResponse,
} from "./useSoloRetry";
