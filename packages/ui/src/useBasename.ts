"use client";

// ───────────────────────────────────────────────────────────────────────────
// useBasename — reverse-resolve a Base address to its primary Basename via
// the L2Resolver contract on Base Sepolia / Mainnet.
//
// Why direct L2 reads instead of viem's getEnsName({ coinType }):
//   The official ENSIP-19 path documented at
//   https://docs.base.org/base-account/framework-integrations/wagmi/basenames
//   requires an Ethereum mainnet PublicClient and warns that public RPCs
//   can't handle the computational demands of trustless cross-chain
//   resolution proofs. The SkillOS wagmi config is Base Sepolia only and
//   has no mainnet client wired in. Reading L2Resolver.name(reverseNode)
//   directly on the same chain we already speak avoids the dependency and
//   matches what OnchainKit's getName helper does internally.
//
// Resolver / cointype constants come from the canonical Basenames repo
// (Coinbase) — same L2Resolver address on every Base network in late 2025;
// reverse-suffix derives from ENSIP-11 cointype = 0x80000000 | chainId, hex.
//
// Failure mode is "soft": any RPC/contract failure surfaces as status="error"
// but the consuming <AddressDisplay> falls through to truncated address,
// so users never see an error toast for a feature they didn't ask for.
//
// Caching is delegated to wagmi's react-query layer with staleTime=30s; names
// rarely change, and remounts pick up freshly registered names within a
// minute via gcTime=5min stale-while-revalidate.
// ───────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { type Address, namehash } from "viem";
import { useChainId, useReadContract } from "wagmi";

const L2_RESOLVER: Record<number, Address> = {
  8453: "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD",
  84532: "0x6533c94869D28fAA8dF77cc63f9e2b2D6Cf77eBA",
};

const REVERSE_SUFFIX: Record<number, string> = {
  8453: "80002105.reverse",
  84532: "80014a34.reverse",
};

const L2_RESOLVER_ABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

function reverseNode(
  address: Address,
  chainId: number,
): `0x${string}` | undefined {
  const suffix = REVERSE_SUFFIX[chainId];
  if (!suffix) return undefined;
  return namehash(`${address.toLowerCase().slice(2)}.${suffix}`);
}

export type BasenameStatus =
  | "idle"
  | "loading"
  | "resolved"
  | "no-name"
  | "error";

export interface UseBasenameReturn {
  status: BasenameStatus;
  /** Resolved primary name (e.g. "youngstar.base.eth"); null in any non-resolved state. */
  name: string | null;
}

export function useBasename(
  address: Address | undefined,
): UseBasenameReturn {
  const chainId = useChainId();
  const node = useMemo(
    () => (address ? reverseNode(address, chainId) : undefined),
    [address, chainId],
  );
  const resolver = L2_RESOLVER[chainId];

  const { data, isLoading, isError, isSuccess } = useReadContract({
    address: resolver,
    abi: L2_RESOLVER_ABI,
    functionName: "name",
    args: node ? [node] : undefined,
    chainId,
    query: {
      enabled: Boolean(address && resolver && node),
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: false,
    },
  });

  if (!address) return { status: "idle", name: null };
  if (!resolver || !node) return { status: "no-name", name: null };
  if (isLoading) return { status: "loading", name: null };
  if (isError) return { status: "error", name: null };
  if (isSuccess && typeof data === "string" && data.length > 0) {
    return { status: "resolved", name: data };
  }
  return { status: "no-name", name: null };
}
