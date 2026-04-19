// Request handlers — import into app route.ts files.
export { scoreHandler } from "./handlers/score";
export { leaderboardHandler } from "./handlers/leaderboard";
export { userUpsertHandler } from "./handlers/user-upsert";
export { dailyGetHandler } from "./handlers/daily-get";
export { dailyGenerateHandler } from "./handlers/daily-generate";
export { analyzeHandler } from "./handlers/analyze";

// 3-tier leaderboard
export {
  submitScoreHandler,
  gameLeaderboardHandler,
  makeGameLeaderboardHandler,
  categoryLeaderboardHandler,
  overallLeaderboardHandler,
  userStatsHandler,
} from "./handlers/leaderboard";

// Instant payout (Feature 1)
export { payoutTriggerHandler } from "./handlers/payout-trigger";

// Async challenges (Feature 2b: on-chain ChallengeEscrow)
export {
  challengeCreateHandler,
  challengeConfirmCreateHandler,
  challengeConfirmStakeHandler,
  challengePrepareAcceptHandler,
  challengeAcceptHandler,
  challengeGetHandler,
  challengeSubmitScoreHandler,
  challengeSettleHandler,
  challengeConfirmSettleHandler,
  challengesListHandler,
} from "./handlers/challenge";
// ogWinCardRuntime is NOT re-exported: Next.js requires `runtime` to be a
// static string literal in the route file, so each /og/win route hardcodes
// `export const runtime = "edge"` instead of reading from a shared const.
export { ogWinCardHandler } from "./handlers/og-win-card";

// Primitives (for custom routes that don't want the full shared handler).
export { verifyBearer } from "./quick-auth";
export type { VerifiedToken, AuthFailure, AuthSuccess } from "./quick-auth";
export { signScore, verifyScoreSignature, uuidToNonce } from "./score-signer";
