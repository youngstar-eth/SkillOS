// ───────────────────────────────────────────────────────────────────────────
// X32-4 resume — fresh tournament with already-registered agents.
//
// Why this exists: the X32-4 broadcast on 2026-05-28T03:06Z died at the
// OPENROUTER_API_KEY check (the key got blown away when the dry-run was
// followed by .env.demo regeneration). That left the chain in a "tournament
// created + sponsored, no submissions" state past endsAt, so the original
// tournament was settled with an empty ranking (refunding the $40 USDC).
//
// The agent wallets are still funded + registered:
//   - mistral (0x0017F5485E848A238e739784FC6368eabfe87427, agentId 6418)
//   - claude  (0x95cc8057E86B1aba8db258CD7E0134cAdBec1Eef, agentId 6419)
//
// This script:
//   1. Reuses both agent bundles (no fundEth, no register — saves ~0.004 ETH)
//   2. createTournament with a fresh tournamentId + new window
//   3. sponsorPool ($39 top-up → $40 total)
//   4. Waits past startsAt
//   5. Runs Mistral Large 2411 + Claude Sonnet 4.5 legs against real stdio MCP
//   6. Waits past endsAt
//   7. settle(id, sortedRanking) — the LLM-submitted winner takes the pool
//   8. Writes resume artifact with full move trails + Blockscout URLs
//
// Usage:
//   set -a; source .env.demo; set +a;  # X25_*_PRIVATE_KEY, X25_*_AGENT_ID, OPENROUTER_API_KEY
//   /usr/local/bin/node --env-file=apps/2048/.env.local ./node_modules/.bin/tsx \
//     scripts/x32-4-resume-broadcast.ts --duration-min=5
// ───────────────────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Hex, type Address, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createTournament,
  deriveTournamentId,
  makePublicClient,
  makeWalletClient,
  runAgentLegBroadcast,
  settleTournament,
  sponsorPoolTopup,
} from "./create-hermes-vs-claude-demo.js";

const BLOCKSCOUT_BASE = "https://base-sepolia.blockscout.com";
const LEG2_MODEL = "deepseek/deepseek-v4-flash";
const LEG1_MODEL = "qwen/qwen-2.5-72b-instruct";
const GAME = "2048" as const;
const CYCLE_WEEKLY = 1;
const START_BUFFER_SEC = 60;
const DEFAULT_DURATION_MIN = 5;

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : undefined;
}

function readPk(s: string | undefined, label: string): Hex {
  if (!s || !/^0x[a-fA-F0-9]{64}$/.test(s)) {
    throw new Error(`${label} must be 0x-prefixed 32-byte hex; got "${s ? "<set>" : "<missing>"}"`);
  }
  return s as Hex;
}

async function main(): Promise<void> {
  const durationMin = Number(arg("duration-min") ?? DEFAULT_DURATION_MIN);
  if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 60) {
    throw new Error(`--duration-min must be int in [1,60], got ${durationMin}`);
  }
  const durationSec = durationMin * 60;

  const studioPk = readPk(process.env.STUDIO_PRIVATE_KEY, "STUDIO_PRIVATE_KEY");
  const mistralPk = readPk(process.env.X25_MISTRAL_PRIVATE_KEY, "X25_MISTRAL_PRIVATE_KEY");
  const deepseekPk = readPk(process.env.X25_DEEPSEEK_PRIVATE_KEY, "X25_DEEPSEEK_PRIVATE_KEY");
  const mistralAgentId = BigInt(process.env.X25_MISTRAL_AGENT_ID ?? "0");
  const deepseekAgentId = BigInt(process.env.X25_DEEPSEEK_AGENT_ID ?? "0");
  if (mistralAgentId === 0n || deepseekAgentId === 0n) {
    throw new Error("X25_MISTRAL_AGENT_ID and X25_DEEPSEEK_AGENT_ID must be set");
  }
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterApiKey) throw new Error("OPENROUTER_API_KEY env required");

  const mistralAddr = privateKeyToAccount(mistralPk).address as Address;
  const deepseekAddr = privateKeyToAccount(deepseekPk).address as Address;

  console.log(`\n=== X32-4 Resume Broadcast (fresh tournament + existing agents) ===\n`);
  console.log(`mistral:  ${mistralAddr} agentId=${mistralAgentId}`);
  console.log(`deepseek: ${deepseekAddr} agentId=${deepseekAgentId}`);
  console.log(`duration: ${durationMin} min`);

  const deployer = makeWalletClient(studioPk);
  if (!deployer.account) throw new Error("deployer client has no account");
  const publicClient = makePublicClient();

  const nowSec = Math.floor(Date.now() / 1000);
  const startsAt = nowSec + START_BUFFER_SEC;
  const endsAt = startsAt + durationSec;
  const tournamentId = deriveTournamentId(GAME, CYCLE_WEEKLY, startsAt);
  console.log(`\ntournamentId=${tournamentId}`);
  console.log(`window: ${new Date(startsAt * 1000).toISOString()} → ${new Date(endsAt * 1000).toISOString()}`);

  // Step 1: createTournament
  const createTxHash = await createTournament(deployer, publicClient, tournamentId, startsAt, endsAt);
  console.log(`\n[resume] createTournament tx: ${createTxHash}`);

  // Step 2: sponsorPool
  const { txHash: sponsorTxHash, receiptTokenId } = await sponsorPoolTopup(deployer, publicClient, tournamentId);
  console.log(`[resume] sponsorPool tx: ${sponsorTxHash} → receiptTokenId=${receiptTokenId}`);

  // Step 3: wait until startsAt
  {
    const waitToStartMs = Math.max(0, startsAt * 1000 - Date.now()) + 2_000;
    if (waitToStartMs > 0) {
      console.log(`\n[resume] sleeping ${Math.round(waitToStartMs / 1000)}s until startsAt...`);
      await new Promise((r) => setTimeout(r, waitToStartMs));
    }
  }

  // Bundles use the existing on-chain identities.
  const mistralBundle = {
    label: "mistral" as const,
    privateKey: mistralPk,
    address: mistralAddr,
    endpoint: `https://mistral.demo.skillos.network`,
    agentId: mistralAgentId,
    registerTxHash: null as Hex | null,
    fundEthTxHash: null as Hex | null,
    fundUsdcTxHash: null as Hex | null,
  };
  const deepseekBundle = {
    label: "deepseek" as const,
    privateKey: deepseekPk,
    address: deepseekAddr,
    endpoint: `https://deepseek.demo.skillos.network`,
    agentId: deepseekAgentId,
    registerTxHash: null as Hex | null,
    fundEthTxHash: null as Hex | null,
    fundUsdcTxHash: null as Hex | null,
  };

  console.log(`\n--- Agent legs via real stdio MCP ---\n`);
  const mistralLeg = await runAgentLegBroadcast({
    agent: mistralBundle,
    model: LEG1_MODEL,
    tournamentId,
    openrouterApiKey,
    publicClient,
  });
  console.log(
    `[resume][mistral] iter=${mistralLeg.iterations} stop=${mistralLeg.stoppedReason} ` +
      `tokens=${mistralLeg.tokenUsage.totalTokens} cost≈$${mistralLeg.costEstimateUsd.toFixed(4)} ` +
      `submitTx=${mistralLeg.submitTxHash ?? "<none>"} confirmed=${mistralLeg.submitTxConfirmed} ` +
      `score=${mistralLeg.claimedSubmission?.score ?? "<none>"} moves=${mistralLeg.moves.length}`,
  );

  const deepseekLeg = await runAgentLegBroadcast({
    agent: deepseekBundle,
    model: LEG2_MODEL,
    tournamentId,
    openrouterApiKey,
    publicClient,
  });
  console.log(
    `[resume][deepseek] iter=${deepseekLeg.iterations} stop=${deepseekLeg.stoppedReason} ` +
      `tokens=${deepseekLeg.tokenUsage.totalTokens} cost≈$${deepseekLeg.costEstimateUsd.toFixed(4)} ` +
      `submitTx=${deepseekLeg.submitTxHash ?? "<none>"} confirmed=${deepseekLeg.submitTxConfirmed} ` +
      `score=${deepseekLeg.claimedSubmission?.score ?? "<none>"} moves=${deepseekLeg.moves.length}`,
  );

  // Step 4: wait past endsAt before settle
  {
    const waitToEndMs = Math.max(0, endsAt * 1000 - Date.now()) + 5_000;
    if (waitToEndMs > 0) {
      console.log(`\n[resume] sleeping ${Math.round(waitToEndMs / 1000)}s until past endsAt before settle...`);
      await new Promise((r) => setTimeout(r, waitToEndMs));
    }
  }

  const settleResult = await settleTournament(deployer, publicClient, tournamentId);
  console.log(`\n[resume] settle tx: ${settleResult.txHash}`);
  console.log(
    `[resume] totalDistributed=${formatUnits(settleResult.totalDistributed, 6)} USDC, refunded=${formatUnits(settleResult.refunded, 6)} USDC`,
  );

  const combinedCost = mistralLeg.costEstimateUsd + deepseekLeg.costEstimateUsd;
  console.log(`[resume] combined LLM cost: $${combinedCost.toFixed(4)}`);

  const artifact = {
    mode: "RESUME-BROADCAST",
    generatedAt: new Date().toISOString(),
    chainId: 84532,
    game: GAME,
    deployer: deployer.account.address,
    tournamentId,
    tournamentWindow: { startsAt, endsAt, durationMin },
    agents: [
      { label: "mistral", address: mistralAddr, agentId: mistralAgentId.toString() },
      { label: "deepseek", address: deepseekAddr, agentId: deepseekAgentId.toString() },
    ],
    txHashes: {
      create: createTxHash,
      sponsor: sponsorTxHash,
      mistralSubmit: mistralLeg.submitTxHash,
      deepseekSubmit: deepseekLeg.submitTxHash,
      settle: settleResult.txHash,
    },
    mistralAgent: mistralLeg,
    deepseekAgent: deepseekLeg,
    settle: {
      sortedRanking: settleResult.sortedRanking,
      totalDistributed: settleResult.totalDistributed.toString(),
      refunded: settleResult.refunded.toString(),
    },
    blockscoutUrls: {
      tournament: `${BLOCKSCOUT_BASE}/address/0x52049b812780134d2F69D6c20C2ef881D49702da`,
      createTx: `${BLOCKSCOUT_BASE}/tx/${createTxHash}`,
      sponsorTx: `${BLOCKSCOUT_BASE}/tx/${sponsorTxHash}`,
      mistralSubmitTx: mistralLeg.submitTxHash ? `${BLOCKSCOUT_BASE}/tx/${mistralLeg.submitTxHash}` : null,
      deepseekSubmitTx: deepseekLeg.submitTxHash ? `${BLOCKSCOUT_BASE}/tx/${deepseekLeg.submitTxHash}` : null,
      settleTx: `${BLOCKSCOUT_BASE}/tx/${settleResult.txHash}`,
    },
    leaderboardUrl: `https://2048.skillos.games/tournament/${tournamentId}`,
    combinedCostUsd: combinedCost,
  };

  const outDir = resolve(process.cwd(), "scripts/output");
  mkdirSync(outDir, { recursive: true });
  const path = resolve(outDir, `x32-4-resume-${artifact.generatedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(path, JSON.stringify(artifact, null, 2));
  console.log(`\n[resume] artifact: ${path}\n=== RESUME BROADCAST COMPLETE ===\n`);
}

main().catch((err) => {
  console.error("[resume] fatal:", err);
  process.exit(1);
});
