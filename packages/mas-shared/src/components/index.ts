export { Providers } from "./Providers";
export { ConnectHeader, type ConnectHeaderProps } from "./ConnectHeader";
export {
  TournamentEntry,
  type TournamentEntryProps,
} from "./TournamentEntry";
export {
  GameOverSubmit,
  type GameOverSubmitProps,
} from "./GameOverSubmit";
export { HomeButton, type HomeButtonProps } from "./HomeButton";
export {
  DailyChallengeBanner,
  type DailyChallengeBannerProps,
  type DailyChallenge,
} from "./DailyChallengeBanner";
export {
  AICoachButton,
  type AICoachButtonProps,
} from "./AICoachButton";
export {
  GameLeaderboard,
  type GameLeaderboardProps,
} from "./GameLeaderboard";
export {
  AutoSubmitScore,
  type AutoSubmitScoreProps,
} from "./AutoSubmitScore";
export {
  PayoutCelebration,
  type PayoutCelebrationProps,
} from "./PayoutCelebration";
// CreateChallengeButton removed — it used the legacy off-chain studio-wallet
// escrow flow (USDC.transfer to studio), which is incompatible with the new
// on-chain ChallengeEscrow verify-event pipeline. Replaced by ChallengeEntryButton
// (pre-play, on-chain, mounted on the game's home page, NOT post-game-over).
export {
  ChallengeEntryButton,
  type ChallengeEntryButtonProps,
} from "./ChallengeEntryButton";
export {
  ChallengePlayBanner,
  type ChallengePlayBannerProps,
} from "./ChallengePlayBanner";
export {
  AcceptChallengeModal,
  type AcceptChallengeModalProps,
} from "./AcceptChallengeModal";
export { ChallengeCard, type ChallengeCardProps } from "./ChallengeCard";
