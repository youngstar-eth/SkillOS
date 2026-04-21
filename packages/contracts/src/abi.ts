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
