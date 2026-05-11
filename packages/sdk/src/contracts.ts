// Inlined minimal contract surface for the SDK.
//
// We can't depend on the workspace `@skillos/contracts` package because the
// published `@skillos/sdk` ships to npm independently. This file vendors the
// minimum subset needed for v0.1 sponsor flow + USDC approval.
//
// Source of truth: packages/contracts/src/{addresses,abi}.ts at HEAD.
// Bump these when contract addresses or ABIs change.

import type { Address } from 'viem';

export interface ChainAddresses {
  chainId: number;
  sponsorshipModule: Address;
  usdc: Address;
  tournamentPool: Address;
}

// Base Sepolia (testnet) — current Phase 1 deployment.
const TESTNET: ChainAddresses = {
  chainId: 84532,
  sponsorshipModule: '0xD76670adB574A4C8D06dfF47127e7143d780ff87',
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  tournamentPool: '0x52049b812780134d2F69D6c20C2ef881D49702da',
};

// Phase 2 mainnet placeholders — must be filled in before mainnet release.
// SDK refuses to construct mainnet calldata until these are set.
const MAINNET: ChainAddresses | null = null;

export function getChainAddresses(
  env: 'testnet' | 'mainnet',
): ChainAddresses {
  if (env === 'mainnet') {
    if (!MAINNET) {
      throw new Error(
        'SkillOS SDK: mainnet addresses not configured in v0.1 — Phase 2 milestone',
      );
    }
    return MAINNET;
  }
  return TESTNET;
}

// SponsorshipModule subset — only the entry point used by useSkillOSSponsor.
// Permissionless: sanctions screening happens on-chain inside sponsorPool().
export const SPONSORSHIP_MODULE_ABI = [
  {
    type: 'function',
    name: 'sponsorPool',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tournamentId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'receiptTokenId', type: 'uint256' }],
  },
] as const;

// ERC-20 approve subset — caller invokes this before sponsorPool() to grant
// SponsorshipModule the right to pull `amount` USDC.
export const ERC20_APPROVE_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// Convert a Builder Code like "bc_o6szuvg1" into the `0x`-prefixed hex bytes
// that wagmi `writeContract`'s `dataSuffix` param expects. Returns undefined
// for falsy inputs so consumers can spread it conditionally.
export function builderCodeToDataSuffix(
  code: string | undefined,
): `0x${string}` | undefined {
  if (!code) return undefined;
  const hex = Array.from(code)
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
  return `0x${hex}` as `0x${string}`;
}

// USDC has 6 decimals on Base. Convert a dollar amount (number or string) to
// atomic units. Accepts integers and fractional values like 12.5.
export function usdcAtoms(amountUsdc: number | string): bigint {
  const s = String(amountUsdc).trim();
  if (!/^[0-9]+(\.[0-9]{1,6})?$/.test(s)) {
    throw new Error(
      `Invalid USDC amount "${s}" — must be a non-negative decimal with ≤6 fractional digits`,
    );
  }
  const [whole, frac = ''] = s.split('.');
  const padded = (frac + '000000').slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(padded);
}
