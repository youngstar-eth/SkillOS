// Request handlers — import into app route.ts files.
export { scoreHandler } from "./handlers/score";
export { leaderboardHandler } from "./handlers/leaderboard";
export { userUpsertHandler } from "./handlers/user-upsert";

// Primitives (for custom routes that don't want the full shared handler).
export { verifyBearer } from "./quick-auth";
export type { VerifiedToken, AuthFailure, AuthSuccess } from "./quick-auth";
export { signScore, verifyScoreSignature, uuidToNonce } from "./score-signer";
