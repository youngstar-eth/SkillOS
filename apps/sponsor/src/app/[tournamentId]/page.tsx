"use client";

// ───────────────────────────────────────────────────────────────────────────
// /[tournamentId] — sponsor flow for a single tournament.
//
// Flow (after wallet connect):
//   1. Read sponsor's USDC balance + current allowance to SponsorshipModule.
//   2. User enters amount (min 1 USDC).
//   3. If allowance < amount → "Approve USDC" tx (USDC.approve).
//   4. After approval mines (or already sufficient) → "Sponsor pool" tx
//      (SponsorshipModule.sponsorPool).
//   5. On settle: show tx hash + "View dashboard" CTA.
//
// Sanctions screening happens on-chain inside sponsorPool — if msg.sender
// is sanctioned the tx reverts with SponsorSanctioned. Surfaced as a
// dedicated message rather than a generic "tx failed" so a user can
// understand the gate is regulatory, not a bug.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  type Address,
  type Hex,
  decodeErrorResult,
  parseUnits,
  formatUnits,
} from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useQuery } from "@tanstack/react-query";
import {
  SPONSORSHIP_MODULE_ABI,
  SPONSORSHIP_MODULE_ADDRESS,
  USDC_ADDRESS,
  CHAIN_ID,
} from "@skillos/contracts";
import { useSkillOSSponsor } from "@skillos/sdk/react";

const USDC_DECIMALS = 6;
const MIN_AMOUNT_USDC = 1; // contract has ZeroAmount; UX min is 1 USDC.

const ERC20_MIN_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
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
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function decodeSponsorError(err: Error): string {
  // viem surfaces revert data in `cause.data`; try to decode against the
  // module's ABI. Fall back to message string.
  const data = (err as unknown as { cause?: { data?: Hex } }).cause?.data;
  if (data) {
    try {
      const decoded = decodeErrorResult({
        abi: SPONSORSHIP_MODULE_ABI,
        data,
      });
      if (decoded.errorName === "SponsorSanctioned") {
        return "This wallet is on the sanctions screening list. Sponsorship cannot proceed.";
      }
      if (decoded.errorName === "ZeroAmount") {
        return "Amount must be greater than zero.";
      }
      return `Reverted: ${decoded.errorName}`;
    } catch {
      // fall through
    }
  }
  return err.message;
}

export default function SponsorFlowPage() {
  const params = useParams<{ tournamentId: string }>();
  const tournamentId = (params?.tournamentId ?? "") as Hex;
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const sponsor = useSkillOSSponsor({ tournamentId });

  const [amount, setAmount] = useState("5");
  const [step, setStep] = useState<"input" | "approving" | "sponsoring" | "done" | "error">(
    "input",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sponsorTxHash, setSponsorTxHash] = useState<Hex | null>(null);

  const amountUsdc = useMemo(() => {
    try {
      return parseUnits(amount || "0", USDC_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amount]);

  // Derives approve + sponsorPool calldata (with builder-code dataSuffix attached)
  // from the active <SkillOSProvider config.builderCode>. Returns null when the
  // amount string fails usdcAtoms validation; handlers guard on this.
  const calls = useMemo(() => {
    if (!amount) return null;
    try {
      return sponsor.fundCalldata({ amountUsdc: amount });
    } catch {
      return null;
    }
  }, [sponsor, amount]);

  const isValidTournamentId = /^0x[0-9a-fA-F]{64}$/.test(tournamentId);

  // ── Reads
  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_MIN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_MIN_ABI,
    functionName: "allowance",
    args: address ? [address, SPONSORSHIP_MODULE_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  // Tournament summary for context (game, prize pool size).
  const { data: tournamentSummary } = useQuery({
    queryKey: ["sponsor", "tournament-sponsors", tournamentId],
    queryFn: async () => {
      const res = await fetch(`/api/sponsor/tournament/${tournamentId}/sponsors`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isValidTournamentId,
  });

  // ── Writes
  const { writeContract: writeApprove, data: approveHash } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const { writeContract: writeSponsor, data: sponsorHash } = useWriteContract();
  const { isLoading: sponsorConfirming, isSuccess: sponsorConfirmed } =
    useWaitForTransactionReceipt({ hash: sponsorHash });

  // After approve confirms, refresh allowance so the UI advances naturally.
  useEffect(() => {
    if (approveConfirmed) {
      refetchAllowance();
      setStep("input");
    }
  }, [approveConfirmed, refetchAllowance]);

  useEffect(() => {
    if (sponsorConfirmed && sponsorHash) {
      setSponsorTxHash(sponsorHash);
      setStep("done");
    }
  }, [sponsorConfirmed, sponsorHash]);

  // ── Validation
  const balanceBig = (balance as bigint | undefined) ?? 0n;
  const allowanceBig = (allowance as bigint | undefined) ?? 0n;
  const insufficientBalance = balanceBig < amountUsdc;
  const needApproval = allowanceBig < amountUsdc;

  function handleApprove() {
    setErrorMsg(null);
    if (chainId !== CHAIN_ID) {
      setErrorMsg(`Wrong network — switch to chain ${CHAIN_ID}`);
      return;
    }
    if (!calls) {
      setErrorMsg("Invalid amount.");
      return;
    }
    setStep("approving");
    writeApprove(calls.approve, {
      onError: (err) => {
        setErrorMsg(err.message);
        setStep("error");
      },
    });
  }

  function handleSponsor() {
    setErrorMsg(null);
    if (!isValidTournamentId) {
      setErrorMsg("Invalid tournament id in URL.");
      return;
    }
    if (!calls) {
      setErrorMsg("Invalid amount.");
      return;
    }
    setStep("sponsoring");
    writeSponsor(calls.fund, {
      onError: (err) => {
        setErrorMsg(decodeSponsorError(err));
        setStep("error");
      },
    });
  }

  if (!isValidTournamentId) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">
          Invalid tournament id. Expected 0x-prefixed 64-hex bytes32.
        </div>
        <Link href="/" className="mt-4 inline-block text-sm text-skill underline">
          ← Back to tournaments
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" className="text-sm text-neutral-400 hover:text-skill">
        ← All tournaments
      </Link>

      <h1 className="mt-3 text-3xl font-bold">Sponsor a Pool</h1>
      <div className="mt-1 break-all font-mono text-xs text-neutral-500">
        {tournamentId}
      </div>

      {tournamentSummary && (
        <div className="mt-4 rounded-md border border-border-subtle bg-bg-elev p-4 text-sm text-neutral-300">
          <div>
            Existing external sponsors:{" "}
            <span className="text-skill">
              {tournamentSummary.uniqueSponsorCount ?? 0}
            </span>
          </div>
          <div>
            Total external contributions: $
            {Number(tournamentSummary.totalUsdc ?? 0).toFixed(2)} USDC
          </div>
        </div>
      )}

      <section className="mt-8 rounded-md border border-border-subtle bg-bg-elev p-6">
        {!isConnected && (
          <div className="text-neutral-400">
            Connect your wallet to fund this pool.
          </div>
        )}

        {isConnected && step !== "done" && (
          <>
            <label className="block text-sm text-neutral-400">
              Sponsorship amount (USDC)
              <input
                type="number"
                min={MIN_AMOUNT_USDC}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-bg-elev2 px-3 py-2 font-mono text-base text-white focus:border-skill focus:outline-none"
              />
            </label>
            <div className="mt-2 text-xs text-neutral-500">
              Wallet balance:{" "}
              {balance
                ? `${Number(formatUnits(balanceBig, USDC_DECIMALS)).toFixed(2)} USDC`
                : "—"}{" "}
              · Allowance: {Number(formatUnits(allowanceBig, USDC_DECIMALS)).toFixed(2)} USDC
            </div>

            {insufficientBalance && (
              <div className="mt-3 text-sm text-red-400">
                Insufficient USDC balance.
              </div>
            )}

            <div className="mt-6 flex gap-3">
              {needApproval ? (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={
                    !amountUsdc ||
                    insufficientBalance ||
                    step === "approving" ||
                    approveConfirming
                  }
                  className="rounded-md bg-skill px-4 py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {approveConfirming
                    ? "Confirming approval…"
                    : step === "approving"
                      ? "Awaiting wallet…"
                      : "1. Approve USDC"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSponsor}
                  disabled={
                    !amountUsdc ||
                    insufficientBalance ||
                    step === "sponsoring" ||
                    sponsorConfirming
                  }
                  className="rounded-md bg-skill px-4 py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sponsorConfirming
                    ? "Confirming sponsorship…"
                    : step === "sponsoring"
                      ? "Awaiting wallet…"
                      : "2. Sponsor pool"}
                </button>
              )}
            </div>

            {errorMsg && (
              <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
                {errorMsg}
              </div>
            )}
          </>
        )}

        {isConnected && step === "done" && sponsorTxHash && (
          <div className="space-y-3">
            <div className="text-lg font-semibold text-skill">
              Sponsorship confirmed.
            </div>
            <div className="text-sm text-neutral-300">
              Soulbound receipt minted to your wallet. The indexer will pick this up
              within ~5 minutes.
            </div>
            <a
              href={`https://sepolia.basescan.org/tx/${sponsorTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block break-all font-mono text-xs text-skill underline"
            >
              {sponsorTxHash}
            </a>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-md bg-skill px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
              >
                View my sponsorships
              </button>
              <Link
                href="/"
                className="rounded-md border border-border bg-bg-elev2 px-4 py-2 text-sm hover:border-skill"
              >
                Sponsor another
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
