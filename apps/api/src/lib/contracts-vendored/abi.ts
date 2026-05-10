// ───────────────────────────────────────────────────────────────────────────
// ChallengeEscrow contract ABI (subset used by the app) + ERC20 (USDC).
//
// ABI extracted from contracts/out/ChallengeEscrow.sol/ChallengeEscrow.json
// (forge build — solc 0.8.26). Only the entries the app actually calls are
// kept here to keep the client bundle small; the struct getter, admin fns,
// and generic ownership machinery are intentionally omitted.
// ───────────────────────────────────────────────────────────────────────────

export const CHALLENGE_ESCROW_ABI = [
  {
    type: "function",
    name: "createChallenge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "gameSlug", type: "bytes32" },
      { name: "stake", type: "uint256" },
      { name: "duration", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "acceptChallenge",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "winner", type: "address" },
      { name: "creatorScore", type: "uint256" },
      { name: "challengerScore", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "walkover",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "winner", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "expireOpen",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "expireAccepted",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getChallenge",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "challenger", type: "address" },
          { name: "gameSlug", type: "bytes32" },
          { name: "stake", type: "uint256" },
          { name: "createdAt", type: "uint256" },
          { name: "acceptedAt", type: "uint256" },
          { name: "expiresAt", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "winner", type: "address" },
          { name: "payoutAmount", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "trustedSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "ChallengeCreated",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "gameSlug", type: "bytes32", indexed: false },
      { name: "stake", type: "uint256", indexed: false },
      { name: "expiresAt", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ChallengeAccepted",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "challenger", type: "address", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ChallengeSettled",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "winner", type: "address", indexed: true },
      { name: "payout", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ChallengeExpired",
    inputs: [{ name: "id", type: "bytes32", indexed: true }],
    anonymous: false,
  },

  // ─── Custom errors (needed for viem to decode revert reasons) ──────────
  { type: "error", name: "SelfChallenge", inputs: [] },
  { type: "error", name: "AlreadyAccepted", inputs: [] },
  { type: "error", name: "ChallengeNotOpen", inputs: [] },
  { type: "error", name: "ChallengeHasExpired", inputs: [] },
  { type: "error", name: "ChallengeAlreadyExists", inputs: [] },
  { type: "error", name: "ChallengeNotAccepted", inputs: [] },
  { type: "error", name: "ChallengeNotExpired", inputs: [] },
  { type: "error", name: "InvalidWinner", inputs: [] },
  { type: "error", name: "BadSignature", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "ZeroStake", inputs: [] },
  { type: "error", name: "ZeroDuration", inputs: [] },
] as const;

// ─── TournamentPool ABI (backend subset) ──────────────────────────────────
//
// Surface kept minimal: only the functions the backend cron + submit endpoint
// call, plus the events and errors needed for receipt decoding.
// Extracted from contracts/out/TournamentPool.sol/TournamentPool.json.

export const TOURNAMENT_POOL_ABI = [
  {
    type: "function",
    name: "createTournament",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "game", type: "bytes32" },
      { name: "cycleType", type: "uint8" },
      { name: "startsAt", type: "uint64" },
      { name: "endsAt", type: "uint64" },
      { name: "prizePool", type: "uint256" },
      { name: "participationBonus", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submitScore",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "player", type: "address" },
      { name: "score", type: "uint256" },
      { name: "matchCountDelta", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "flagScore",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "player", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "sortedRanking", type: "address[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getParticipants",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    // Pre-flight settle-guard: cron reads this before broadcasting settle()
    // to catch already-settled / not-found / ends-after-now states without
    // burning gas on a doomed tx. See packages/duel-backend/src/cron/settle-guard.ts.
    type: "function",
    name: "getTournament",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "sponsor", type: "address" },
          { name: "game", type: "bytes32" },
          { name: "cycleType", type: "uint8" },
          { name: "startsAt", type: "uint64" },
          { name: "endsAt", type: "uint64" },
          { name: "prizePool", type: "uint256" },
          { name: "participationBonus", type: "uint256" },
          { name: "settled", type: "bool" },
          { name: "participants", type: "address[]" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "effectiveScoreOf",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isParticipant",
    stateMutability: "view",
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "bestScore",
    stateMutability: "view",
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "matchCount",
    stateMutability: "view",
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "TournamentCreated",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "sponsor", type: "address", indexed: true },
      { name: "game", type: "bytes32", indexed: true },
      { name: "cycleType", type: "uint8", indexed: false },
      { name: "startsAt", type: "uint64", indexed: false },
      { name: "endsAt", type: "uint64", indexed: false },
      { name: "prizePool", type: "uint256", indexed: false },
      { name: "participationBonus", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ScoreSubmitted",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "score", type: "uint256", indexed: false },
      { name: "matchCountDelta", type: "uint256", indexed: false },
      { name: "nonce", type: "bytes32", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TournamentSettled",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "totalDistributed", type: "uint256", indexed: false },
      { name: "refunded", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },

  // ─── v2 additions (solo + retry fee) ──────────────────────────────────
  {
    type: "function",
    name: "submitSoloScore",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "player", type: "address" },
      { name: "score", type: "uint256" },
      { name: "soloRunId", type: "bytes32" },
      { name: "matchCountDelta", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "chargeRetryFee",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "player", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawFees",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "to", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "soloSubmissionCount",
    stateMutability: "view",
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "feePaidByPlayer",
    stateMutability: "view",
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "feeCollected",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "RETRY_FEE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MATCH_COUNT_CAP",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "SoloScoreSubmitted",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "score", type: "uint256", indexed: false },
      { name: "matchCountDelta", type: "uint256", indexed: false },
      { name: "nonce", type: "bytes32", indexed: false },
      { name: "soloRunId", type: "bytes32", indexed: false },
      { name: "priorSoloCount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RetryFeePaid",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "FeesWithdrawn",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },

  // ─── Custom errors ────────────────────────────────────────────────────
  { type: "error", name: "TournamentNotFound", inputs: [] },
  { type: "error", name: "TournamentAlreadyExists", inputs: [] },
  { type: "error", name: "TournamentAlreadySettled", inputs: [] },
  { type: "error", name: "TournamentNotEnded", inputs: [] },
  { type: "error", name: "TournamentAlreadyEnded", inputs: [] },
  { type: "error", name: "TournamentNotStarted", inputs: [] },
  { type: "error", name: "InvalidWindow", inputs: [] },
  { type: "error", name: "ZeroPrize", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "BadSignature", inputs: [] },
  { type: "error", name: "NonceUsed", inputs: [] },
  { type: "error", name: "PlayerNotInTournament", inputs: [] },
  { type: "error", name: "InvalidRankingLength", inputs: [] },
  { type: "error", name: "InvalidRankingOrder", inputs: [] },
  { type: "error", name: "NotParticipant", inputs: [] },
  { type: "error", name: "PlayerExcluded", inputs: [] },
  { type: "error", name: "DuplicateInRanking", inputs: [] },
  { type: "error", name: "InsufficientFeePaid", inputs: [] },
  { type: "error", name: "PlayerMismatch", inputs: [] },
  // ─── v2.1 patch: permissionless sponsor top-up ─────────────────────────
  {
    type: "function",
    name: "fundPrizePool",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "PrizePoolFunded",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "funder", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newPrizePool", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

// ───────────────────────────────────────────────────────────────────────────
// SponsorshipModule — permissionless sponsor entry point. Wraps fundPrizePool
// with sanctions screening + soulbound receipt mint.
//
// Subset used by the apex /sponsor surface + indexer cron. View getters
// for sponsorContributions / totalSponsorsByTournament are included for
// the dashboard read path.
// ───────────────────────────────────────────────────────────────────────────

export const SPONSORSHIP_MODULE_ABI = [
  {
    type: "function",
    name: "sponsorPool",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tournamentId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "receiptTokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "sponsorContributions",
    stateMutability: "view",
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSponsorsByTournament",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "sanctionsOracle",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "USDC",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "POOL",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "RECEIPT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "PoolSponsored",
    inputs: [
      { name: "tournamentId", type: "bytes32", indexed: true },
      { name: "sponsor", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "receiptTokenId", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  // Custom errors
  { type: "error", name: "SponsorSanctioned", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
] as const;

// ─── ERC20 (USDC) ABI — approve / balanceOf / allowance ────────────────────

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ───────────────────────────────────────────────────────────────────────────
// SkillbaseAnchor contract ABI (subset used by the app).
//
// ABI extracted from contracts/out/SkillbaseAnchor.sol/SkillbaseAnchor.json
// (forge build — solc 0.8.26). Cron route uses anchorSnapshot (write) +
// verifySnapshot/getSnapshotHash (read). Admin functions kept off the client
// surface — they're used from forge scripts only.
// ───────────────────────────────────────────────────────────────────────────

export const SKILLBASE_ANCHOR_ABI = [
  {
    type: "function",
    name: "anchorSnapshot",
    stateMutability: "nonpayable",
    inputs: [
      { name: "timestamp", type: "uint256" },
      { name: "snapshotHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getSnapshotHash",
    stateMutability: "view",
    inputs: [{ name: "timestamp", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "verifySnapshot",
    stateMutability: "view",
    inputs: [
      { name: "timestamp", type: "uint256" },
      { name: "expectedHash", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "snapshots",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "totalAnchored",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "authorizedAnchors",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "SnapshotAnchored",
    inputs: [
      { name: "timestamp", type: "uint256", indexed: true },
      { name: "snapshotHash", type: "bytes32", indexed: true },
      { name: "anchoredAt", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  // Custom errors (decoded by viem when revert is encountered)
  { type: "error", name: "AlreadyAnchored", inputs: [] },
  { type: "error", name: "InvalidHash", inputs: [] },
  { type: "error", name: "InvalidTimestamp", inputs: [] },
  { type: "error", name: "UnauthorizedAnchor", inputs: [] },
] as const;
