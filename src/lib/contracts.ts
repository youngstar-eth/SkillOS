import type { Address } from "viem";

// Base Sepolia deployment. Addresses are public and read at runtime from
// NEXT_PUBLIC_* env vars so they can be swapped without a rebuild.
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);

export const CHALLENGE_ESCROW_ADDRESS = (process.env
  .NEXT_PUBLIC_CHALLENGE_ESCROW_ADDRESS ??
  "0x52e5E45456DeC882048b430a968Cda6061575be0") as Address;

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as Address;

// Minimal ABI — Agent 2 will replace with the full ABI pulled from
// contracts/out/ChallengeEscrow.sol/ChallengeEscrow.json after `forge build`.
export const CHALLENGE_ESCROW_ABI = [
  {
    type: "function",
    name: "createChallenge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "stakeAmount", type: "uint256" },
      { name: "seed", type: "bytes32" },
    ],
    outputs: [{ name: "challengeId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "acceptChallenge",
    stateMutability: "nonpayable",
    inputs: [{ name: "challengeId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "challengeId", type: "bytes32" },
      { name: "winner", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

// Minimal USDC (ERC20) ABI — approve + balanceOf are all the front-end needs
// before a stake tx.
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
