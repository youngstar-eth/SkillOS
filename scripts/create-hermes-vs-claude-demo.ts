// ───────────────────────────────────────────────────────────────────────────
// X25 Hermes vs Claude Demo Orchestrator — Match3 on Base Sepolia.
//
// End-to-end orchestration for the "Hermes 3 vs Claude" climax demo:
//   1. Generate 2 fresh agent wallets (Hermes + Claude labels).
//   2. Fund each from deployer: 0.005 ETH (gas) + 5 USDC (any future retry).
//   3. Register each on ERC-8004 IdentityRegistry → capture agentId.
//   4. Create Match3 tournament w/ 60-min window + seed prize pool (1 USDC).
//   5. SponsorshipModule.sponsorPool(id, 49 USDC) from deployer → total 50 USDC
//      prize + SponsorReceiptSBT mint captured via PoolSponsored event.
//   6. Submission flow per agent — PSEUDOCODE skeleton (workstream C wires
//      the actual Hermes wrapper; Claude direct via @skillos/sdk).
//   7. Post-window: studio-signer settle(id, sortedRanking) — sortedRanking
//      built from on-chain effectiveScoreOf() reads.
//   8. Write artifacts to scripts/output/hermes-demo-{timestamp}.json.
//
// PROMPT INCONSISTENCIES SURFACED (see PR description):
//   - Sprint cited mainnet registry 0x8004A169...a432; demo is testnet, so
//     script uses Base Sepolia registry 0x8004A818...BD9e (per
//     packages/mcp/src/config.ts ENV_DEFAULTS.testnet).
//   - Sprint said `settle(tournamentId)`; deployed v2.1 ABI is
//     `settle(id, sortedRanking)`. Script computes sortedRanking on-chain.
//   - Sprint said "sponsor pre-funds, then create tournament"; the deployed
//     SponsorshipModule.sponsorPool requires the tournament to exist on-chain,
//     and createTournament reverts ZeroPrize if prizePool == 0. Resolution:
//     createTournament with 1 USDC seed → sponsorPool(49 USDC) → total 50
//     USDC + SBT mint captured. PoolSponsored event carries receiptTokenId.
//
// MATCHES X20 PATTERN:
//   - viem-direct (no CDP SDK)
//   - --dry-run by default; --broadcast for live tx
//   - reuses @skillos/contracts addresses + ABIs (deployed v2.1 surface)
//   - STUDIO_PRIVATE_KEY as deployer wallet (matches existing scripts)
//
// USAGE:
//   Dry-run (default — composes all 5 broadcast txs, sends NONE):
//     /usr/local/bin/node --env-file=apps/2048/.env.local \
//       ./node_modules/.bin/tsx scripts/create-hermes-vs-claude-demo.ts
//
//   Broadcast (X32-2 — end-to-end on Base Sepolia, short window + settle):
//     set -a; source .env.demo; set +a   # provides OPENROUTER_API_KEY
//     /usr/local/bin/node --env-file=apps/2048/.env.local \
//       ./node_modules/.bin/tsx scripts/create-hermes-vs-claude-demo.ts \
//       --broadcast --duration-min=3
//
//   Custom tournament window (default 60 min; --duration-min=3 recommended for
//   X32-2 broadcast since the script blocks until startsAt + endsAt for settle):
//     ... scripts/create-hermes-vs-claude-demo.ts --duration-min=120
//
// REQUIRED ENV (from apps/2048/.env.local):
//   STUDIO_PRIVATE_KEY              — deployer wallet (≥ 51 USDC + ~0.05 ETH gas)
// OPTIONAL ENV:
//   BASE_SEPOLIA_RPC_URL            — defaults to https://sepolia.base.org
//   HERMES_DEMO_OUTPUT_DIR          — defaults to scripts/output
//
// OUTPUTS:
//   - scripts/output/hermes-demo-{ISOTIMESTAMP}.json  (artifact bundle)
//   - .env.demo                                       (agent private keys; gitignored)
//
// SAFETY: scripts/output/ and .env.demo are both gitignored — see .gitignore.
// ───────────────────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  keccak256,
  parseEventLogs,
  toBytes,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  ERC20_ABI,
  SPONSORSHIP_MODULE_ABI,
  SPONSORSHIP_MODULE_ADDRESS,
  SPONSOR_RECEIPT_SBT_ADDRESS,
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V2_ADDRESS,
  USDC_ADDRESS,
} from "@skillos/contracts";
import {
  createHermesMcpClient,
  type McpClientLike,
  type TokenUsage,
} from "@skillos/hermes-mcp-wrapper";

// ─── Config (founder-confirmed) ────────────────────────────────────────────

const GAME = "match3" as const;
const CYCLE_WEEKLY = 1;             // CycleType.Weekly — longest valid v2.1 cycle
const START_BUFFER_SEC = 60;        // small buffer to avoid mining-edge race
const DEFAULT_DURATION_MIN = 60;    // demo tournament window
const PARTICIPATION_BONUS = 50n;

// Tournament economics
// X32-2 adjustment: sponsor pool is $40 USDC (not $50) due to demo-deployer
// wallet balance ceiling on Base Sepolia (45.5 USDC at sprint open). Demo
// narrative framing: "real sponsored stake" without dollar-specific claim,
// or explicit $40 narration — founder discretion in video script.
const SEED_PRIZE_USDC = 1_000_000n;       // 1 USDC: minimum to bypass ZeroPrize
const SPONSOR_TOPUP_USDC = 39_000_000n;   // 39 USDC: brings total to 40 USDC
const TOTAL_PRIZE_USDC = SEED_PRIZE_USDC + SPONSOR_TOPUP_USDC;

// Per-agent funding. Agents only need ETH for the register() tx — submit_score
// goes through the SkillOS API which broadcasts the attestation server-side
// using STUDIO_PRIVATE_KEY, so agent wallets do not need USDC. AGENT_USDC kept
// at 0 in X32-2 to keep deployer USDC inside the $40 pool budget.
const AGENT_GAS_ETH = 2_000_000_000_000_000n;  // 0.002 ETH (register costs ~0.0005)
const AGENT_USDC = 0n;                          // X32-2: skip — not needed for submit_score

// Base Sepolia ERC-8004 IdentityRegistry (testnet — per packages/mcp/src/config.ts).
// Sprint prompt cited mainnet 0x8004A169...a432; demo is testnet → corrected.
const IDENTITY_REGISTRY_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address;
const BASE_SEPOLIA_CHAIN_ID = 84532;
const DEFAULT_RPC = "https://sepolia.base.org";

// ─── Minimal ABI surfaces ──────────────────────────────────────────────────

// ERC20 transfer fragment — @skillos/contracts ERC20_ABI covers approve/balanceOf/allowance
// but not transfer (used here to fund agents). Keep local + minimal.
const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ERC-8004 IdentityRegistry — register + ownerOf + Registered event.
// Schema matches packages/mcp/src/tools/agent_register.ts + ERC-721 standard.
const IDENTITY_REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "Registered",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

// ─── CLI args ──────────────────────────────────────────────────────────────

const BROADCAST = process.argv.includes("--broadcast");
const DURATION_MIN = (() => {
  const arg = process.argv.find((a) => a.startsWith("--duration-min="));
  if (!arg) return DEFAULT_DURATION_MIN;
  const n = Number(arg.split("=")[1]);
  if (!Number.isInteger(n) || n < 1 || n > 24 * 60) {
    throw new Error(`--duration-min must be int in [1, 1440], got ${arg}`);
  }
  return n;
})();
const DURATION_SEC = DURATION_MIN * 60;

// ─── Helpers ───────────────────────────────────────────────────────────────

function deriveTournamentId(
  game: string,
  cycle: number,
  startsAtSec: number,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint8" }, { type: "uint64" }],
      [keccak256(toBytes(game)), cycle, BigInt(startsAtSec)],
    ),
  );
}

function buildAgentURI(name: string, endpoint: string): string {
  const metadata = {
    name,
    description: `X25 demo agent (${name}) — Match3 on Base Sepolia.`,
    image: "https://skillos.network/agent-default.png",
    services: [{ name: "web", endpoint }],
    active: true,
    supportedTrust: ["reputation"],
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;
}

function rpcUrl(): string {
  return process.env.BASE_SEPOLIA_RPC_URL ?? DEFAULT_RPC;
}

function makePublicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl(), { retryCount: 3, retryDelay: 200, timeout: 30_000 }),
  });
}

function makeWalletClient(pk: Hex) {
  return createWalletClient({
    account: privateKeyToAccount(pk),
    chain: baseSepolia,
    transport: http(rpcUrl(), { retryCount: 3, retryDelay: 200, timeout: 30_000 }),
  });
}

type PublicClientT = ReturnType<typeof makePublicClient>;
type WalletClientT = ReturnType<typeof makeWalletClient>;

// ─── Bootstrap: 2 fresh agent wallets ──────────────────────────────────────

interface AgentBundle {
  label: "hermes" | "claude";
  privateKey: Hex;
  address: Address;
  endpoint: string;
  agentId: bigint | null;       // populated after register
  registerTxHash: Hex | null;
  fundEthTxHash: Hex | null;
  fundUsdcTxHash: Hex | null;
}

function generateAgentBundle(label: AgentBundle["label"]): AgentBundle {
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  return {
    label,
    privateKey: pk,
    address: account.address,
    endpoint: `https://${label}.demo.skillos.network`,
    agentId: null,
    registerTxHash: null,
    fundEthTxHash: null,
    fundUsdcTxHash: null,
  };
}

function persistEnvDemo(bundles: AgentBundle[], envPath: string): void {
  const lines = [
    "# X25 Hermes vs Claude demo — generated agent wallets.",
    "# DO NOT commit. Listed in .gitignore via .env.demo entry.",
    `# Generated: ${new Date().toISOString()}`,
    "",
  ];
  for (const b of bundles) {
    lines.push(`# ${b.label.toUpperCase()} agent`);
    lines.push(`X25_${b.label.toUpperCase()}_PRIVATE_KEY=${b.privateKey}`);
    lines.push(`X25_${b.label.toUpperCase()}_ADDRESS=${b.address}`);
    if (b.agentId !== null) {
      lines.push(`X25_${b.label.toUpperCase()}_AGENT_ID=${b.agentId.toString()}`);
    }
    lines.push("");
  }
  mkdirSync(dirname(envPath), { recursive: true });
  writeFileSync(envPath, lines.join("\n"), { encoding: "utf8", mode: 0o600 });
}

// ─── Step 2: fund agents from deployer ─────────────────────────────────────

async function fundAgentEth(
  deployer: WalletClientT,
  publicClient: PublicClientT,
  agent: AgentBundle,
): Promise<Hex> {
  if (!deployer.account) throw new Error("deployer client has no account");
  const hash = await deployer.sendTransaction({
    account: deployer.account,
    chain: baseSepolia,
    to: agent.address,
    value: AGENT_GAS_ETH,
  });
  await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return hash;
}

async function fundAgentUsdc(
  deployer: WalletClientT,
  publicClient: PublicClientT,
  agent: AgentBundle,
): Promise<Hex> {
  if (!deployer.account) throw new Error("deployer client has no account");
  const hash = await deployer.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [agent.address, AGENT_USDC],
    account: deployer.account,
    chain: baseSepolia,
  });
  await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return hash;
}

// ─── Step 3: register each agent on ERC-8004 ───────────────────────────────

async function registerAgent(
  agent: AgentBundle,
  publicClient: PublicClientT,
): Promise<{ agentId: bigint; txHash: Hex }> {
  const wallet = makeWalletClient(agent.privateKey);
  if (!wallet.account) throw new Error(`${agent.label}: wallet has no account`);

  const agentURI = buildAgentURI(agent.label, agent.endpoint);
  const txHash = await wallet.writeContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "register",
    args: [agentURI],
    account: wallet.account,
    chain: baseSepolia,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  if (receipt.status !== "success") {
    throw new Error(`[x25] ${agent.label} register reverted: ${txHash}`);
  }
  const logs = parseEventLogs({
    abi: IDENTITY_REGISTRY_ABI,
    logs: receipt.logs,
    eventName: "Registered",
  });
  if (logs.length === 0) {
    throw new Error(`[x25] ${agent.label} register tx ${txHash} emitted no Registered event`);
  }
  const { agentId, owner } = logs[0]!.args as { agentId: bigint; owner: Address };

  // Verify on-chain ownerOf(agentId) == wallet.address (sprint deliverable #2).
  // sepolia.base.org is a load-balanced public RPC — `waitForTransactionReceipt`
  // resolves against the proposer node, but subsequent reads can hit a replica
  // that hasn't yet ingested the block. Retry briefly on ERC721NonexistentToken
  // (selector 0x7e273289) — first observed during X32-2 broadcast smoke.
  let onChainOwner: Address | null = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      onChainOwner = (await publicClient.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "ownerOf",
        args: [agentId],
      })) as Address;
      break;
    } catch (e) {
      const msg = (e as Error).message;
      const stale = msg.includes("0x7e273289") || msg.includes("NonexistentToken");
      if (!stale || attempt === 6) throw e;
      await new Promise((r) => setTimeout(r, 750 * attempt)); // 0.75s, 1.5s, 2.25s, 3s, 3.75s
    }
  }
  if (!onChainOwner) throw new Error(`[x25] ${agent.label} ownerOf returned null after retries`);
  if (onChainOwner.toLowerCase() !== agent.address.toLowerCase()) {
    throw new Error(
      `[x25] ${agent.label} ownerOf mismatch: registry=${onChainOwner}, wallet=${agent.address}`,
    );
  }
  if (owner.toLowerCase() !== agent.address.toLowerCase()) {
    throw new Error(
      `[x25] ${agent.label} Registered.owner mismatch: event=${owner}, wallet=${agent.address}`,
    );
  }

  return { agentId, txHash };
}

// ─── Step 4: createTournament (seed 1 USDC) ────────────────────────────────

async function ensureUsdcAllowance(
  deployer: WalletClientT,
  publicClient: PublicClientT,
  spender: Address,
  need: bigint,
): Promise<Hex | null> {
  if (!deployer.account) throw new Error("deployer client has no account");
  const current = (await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [deployer.account.address, spender],
  })) as bigint;
  if (current >= need) return null;

  const hash = await deployer.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, 2n ** 256n - 1n],
    account: deployer.account,
    chain: baseSepolia,
  });
  await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });

  // Public Base Sepolia RPC is load-balanced. After waitForTransactionReceipt
  // resolves, the simulation for the immediately-following writeContract can
  // still hit a replica without the new allowance, reverting with
  // "ERC20: transfer amount exceeds allowance". Poll readContract until the
  // replica we're talking to reports the new allowance. (First observed
  // during X32-2 broadcast smoke at sponsorPool, after createTournament.)
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const seen = (await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [deployer.account.address, spender],
    })) as bigint;
    if (seen >= need) return hash;
    await new Promise((r) => setTimeout(r, 500 * attempt)); // 0.5s … up to 5s
  }
  throw new Error(`[x32-2] approve replica-propagation timeout for spender=${spender}`);
}

async function createTournament(
  deployer: WalletClientT,
  publicClient: PublicClientT,
  tournamentId: Hex,
  startsAt: number,
  endsAt: number,
): Promise<Hex> {
  if (!deployer.account) throw new Error("deployer client has no account");
  await ensureUsdcAllowance(deployer, publicClient, TOURNAMENT_POOL_V2_ADDRESS, SEED_PRIZE_USDC);

  const hash = await deployer.writeContract({
    address: TOURNAMENT_POOL_V2_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    functionName: "createTournament",
    args: [
      tournamentId,
      keccak256(toBytes(GAME)),
      CYCLE_WEEKLY,
      BigInt(startsAt),
      BigInt(endsAt),
      SEED_PRIZE_USDC,
      PARTICIPATION_BONUS,
    ] as never,
    account: deployer.account,
    chain: baseSepolia,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") {
    throw new Error(`[x25] createTournament reverted: ${hash}`);
  }
  return hash;
}

// ─── Step 5: sponsorPool top-up → SBT mint ─────────────────────────────────

async function sponsorPoolTopup(
  deployer: WalletClientT,
  publicClient: PublicClientT,
  tournamentId: Hex,
): Promise<{ txHash: Hex; receiptTokenId: bigint }> {
  if (!deployer.account) throw new Error("deployer client has no account");
  await ensureUsdcAllowance(deployer, publicClient, SPONSORSHIP_MODULE_ADDRESS, SPONSOR_TOPUP_USDC);

  // Retry the sponsorPool write itself on replica-stale reverts —
  // estimateGas runs inside writeContract and may hit a replica that hasn't
  // yet seen a just-confirmed write. Three known stale-replica surfaces:
  //   - OZ ERC20 "transfer amount exceeds allowance" / "ERC20InsufficientAllowance"
  //     (post-approve race; X32-2 fix)
  //   - TournamentNotFound — pool's `t.sponsor == address(0)` check bubbling
  //     before the just-confirmed createTournament write propagates (X32-3
  //     fix). viem can't decode the selector against SPONSORSHIP_MODULE_ABI
  //     (the error lives on TournamentPool), so it surfaces as raw hex
  //     `0x03361a25`.
  // Up to 6 attempts × 1.5s ≈ 9s, more than enough for replica fan-out on
  // Base Sepolia.
  let txHash: Hex | null = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      txHash = await deployer.writeContract({
        address: SPONSORSHIP_MODULE_ADDRESS,
        abi: SPONSORSHIP_MODULE_ABI,
        functionName: "sponsorPool",
        args: [tournamentId, SPONSOR_TOPUP_USDC],
        account: deployer.account,
        chain: baseSepolia,
      });
      break;
    } catch (e) {
      const msg = (e as Error).message;
      const stale =
        msg.includes("transfer amount exceeds allowance") ||
        msg.includes("ERC20InsufficientAllowance") ||
        msg.includes("TournamentNotFound") ||
        msg.includes("0x03361a25");
      if (!stale || attempt === 6) throw e;
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }
  if (!txHash) throw new Error("[x32-2] sponsorPool: no txHash after retries");
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  if (receipt.status !== "success") {
    throw new Error(`[x25] sponsorPool reverted: ${txHash}`);
  }

  // Capture PoolSponsored event → receiptTokenId (SBT mint reference).
  const logs = parseEventLogs({
    abi: SPONSORSHIP_MODULE_ABI,
    logs: receipt.logs,
    eventName: "PoolSponsored",
  });
  if (logs.length === 0) {
    throw new Error(`[x25] sponsorPool ${txHash} emitted no PoolSponsored event`);
  }
  const { receiptTokenId } = logs[0]!.args as { receiptTokenId: bigint };
  return { txHash, receiptTokenId };
}

// ─── Step 6: per-agent submission flow via @skillos/hermes-mcp-wrapper ─────
//
// X32-2 update (broadcast path live; replaces "dry-run only" X32 disclaimer):
//
// Two execution modes share `createHermesMcpClient` from
// `@skillos/hermes-mcp-wrapper`:
//   - DRY-RUN: `runAgentLegDryRun` injects an in-process `_mcp` stub that
//     mirrors @skillos/mcp's `submit_score` JSON-Schema and returns synthetic
//     success (no SIWA, no HTTP, no broadcast). Used for cost-bounded smokes.
//   - BROADCAST: `runAgentLegBroadcast` spawns the real @skillos/mcp stdio
//     server (`packages/mcp/dist/index.js`) via the wrapper's StdioClient
//     transport AND wraps the real `Client` through `_mcp` to capture the
//     `submit_score` tool result text — that's how we recover the on-chain
//     txHash + soloRunId the SkillOS API returns. The wrapper still drives
//     the agentic loop end-to-end against the real MCP server; the
//     `_mcp` wrapper is just a passthrough with a result-capture side effect.
//
// X32 (PR #172) update:
//
// X32 baseline (preserved verbatim — broadcast extension is X32-2 only):
//
// Both agent legs share a single MCP host implementation — `createHermesMcpClient`
// from @skillos/hermes-mcp-wrapper — differing only in the OpenRouter model id.
// This is the "wire-identical multi-agent" pattern locked in X27/X29: same
// @modelcontextprotocol/sdk transport, same tools-bridge, same agentic loop,
// only the LLM brain differs. (Founder direction on X32 question 1, May 27 2026:
// "wrapper is generic by design — Anthropic SDK was an unnecessary constraint".)
//
// Dry-run path (this sprint, no chain broadcast):
//   - Wrapper's `_mcp` test seam injects an in-process stub that exposes the
//     real @skillos/mcp `submit_score` JSON-Schema and returns synthetic
//     success (no SIWA, no HTTP, no broadcast). The wrapper's agentic loop is
//     exercised end-to-end; only the chain-touching tail is stubbed out.
//   - The stub captures the LLM's tool-call args so the artifact records what
//     each agent claimed.
//
// Broadcast path (deferred to next sprint per X32 constraint):
//   - Replace `_mcp` stub with a real stdio transport to `packages/mcp/dist/index.js`,
//     pass the agent's freshly-registered agentId + privateKey via env so the
//     MCP server can do SIWA + signed POST /v1/agents/scores. Out of scope here.

// X32 model selection — see PR description for full rationale.
//
// The "hermes" agent leg label is retained (preserves AgentBundle wiring,
// env var names X25_HERMES_*, endpoint URLs) but the underlying model is
// NOT a Hermes variant: as of May 27 2026, OpenRouter routes every Hermes
// model (3-70b, 3-405b, 3-405b:free, 4-70b, 4-405b) to providers that do
// not expose function-calling (`tools: false` in `/api/v1/models`). The
// X29 wrapper relies on tool-use, so any Hermes leg routed through
// OpenRouter cannot drive a `submit_score` tool call today.
//
// Founder direction on X32 question 2 (May 27 2026): pick the first
// tool-use-verified open-weights model on OpenRouter from a defined
// fallback chain. Verified order at the time of selection:
//   1. meta-llama/llama-3.3-70b-instruct   — tools: true, $0.10/$0.32 per M (chosen)
//   2. mistralai/mistral-large-2411        — tools: true, $2.00/$6.00 per M
//   3. qwen/qwen-2.5-72b-instruct          — tools: true, $0.36/$0.40 per M
//   4. deepseek/deepseek-chat              — tools: true, $0.23/$0.91 per M
//   5. google/gemini-2.0-flash-exp:free    — not currently on OpenRouter
//
// Phase 2 follow-up (out of X32 scope): direct Nous Research Hermes Agent
// API integration would restore "Hermes vs Claude" narrative; tracked
// separately. v1.11 housekeeping: Strategic Memory v1.10 demo-narrative
// note + pitch deck Slide 8 must update to "{ChosenModel} vs Claude" or
// adopt the looser "open-weights vs frontier" framing.
const OPEN_WEIGHTS_MODEL = "meta-llama/llama-3.3-70b-instruct";

// Founder direction: Claude Sonnet 4.5 is the locked Claude leg model for
// this sprint. Sonnet 4.6 is also available on OpenRouter (tools: true) and
// is the documented "latest" per system context; staying on 4.5 per the
// founder's X32 message.
const CLAUDE_MODEL = "anthropic/claude-sonnet-4.5";

// OpenRouter pricing overlay for models the X29 wrapper's `estimateCostUsd`
// doesn't natively price (it only knows the three validated Hermes ids,
// degrades to $0 otherwise — by design). We layer a local table so the
// demo artifact's per-agent costEstimate is non-zero for Claude + the
// chosen open-weights leg. Rates sourced from OpenRouter `/api/v1/models`
// `pricing` field at selection time; cross-check on rerun if drift suspected.
const OPENROUTER_PRICING_USD_PER_M: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4.5": { input: 3.0, output: 15.0 },
  "anthropic/claude-sonnet-4.6": { input: 3.0, output: 15.0 },
  "anthropic/claude-haiku-4.5": { input: 1.0, output: 5.0 },
  "anthropic/claude-opus-4.5": { input: 15.0, output: 75.0 },
  "meta-llama/llama-3.3-70b-instruct": { input: 0.1, output: 0.32 },
  "mistralai/mistral-large-2411": { input: 2.0, output: 6.0 },
  "qwen/qwen-2.5-72b-instruct": { input: 0.36, output: 0.4 },
  "deepseek/deepseek-chat": { input: 0.2288, output: 0.9144 },
};

function overlayCostUsd(model: string, prompt: number, completion: number): number {
  const rates = OPENROUTER_PRICING_USD_PER_M[model];
  if (!rates) return 0;
  return (prompt * rates.input + completion * rates.output) / 1_000_000;
}

const AGENT_SYSTEM_PROMPT = (label: string, tournamentId: Hex): string =>
  [
    `You are an autonomous agent competing in a Match3 score-attack tournament on`,
    `SkillOS testnet (Base Sepolia). Your agent label is "${label}".`,
    ``,
    `Game: Match3 (deterministic — engine seeds runs with seed=42).`,
    `Tournament ID: ${tournamentId}`,
    `Tier: T0 (signature-only submission; no plausibility infra in v0.1).`,
    ``,
    `Task: Compose exactly one \`submit_score\` tool call claiming your final score`,
    `for a single Match3 playthrough. Choose a plausible integer score in [100, 10000]`,
    `reflecting competent (not perfect) play. After the tool returns, output a single`,
    `concise sentence describing your run.`,
    ``,
    `Constraints:`,
    `- Call \`submit_score\` exactly once with the tournamentId above.`,
    `- Score must be an integer in [100, 10000].`,
    `- Do not call any other tools.`,
    `- Do not retry on tool error — surface it and stop.`,
  ].join("\n");

const AGENT_USER_PROMPT = "Submit your Match3 score for this tournament.";

// JSON-Schema mirror of packages/mcp/src/tools/submit_score.ts inputSchema.
// We keep this in sync manually rather than importing it because the source
// uses zod and Hermes/Claude on OpenRouter expect plain JSON-Schema in the
// tools bridge. If the real submit_score schema drifts, the broadcast-path
// migration will catch it (it'll listTools off the real server).
const DRY_RUN_SUBMIT_SCORE_SCHEMA = {
  type: "object",
  properties: {
    tournamentId: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{64}$",
      description: "Tournament id (bytes32 hex).",
    },
    score: { type: "integer", minimum: 0, description: "Raw player score." },
    tier: { type: "string", enum: ["T0", "T1", "T2", "T3"], description: "Quality tier. v0.1 only supports T0." },
    soloRunId: { type: "string", pattern: "^0x[a-fA-F0-9]{64}$" },
    matchCountDelta: { type: "integer", minimum: 1, maximum: 10 },
  },
  required: ["tournamentId", "score"],
  additionalProperties: false,
} as const;

interface DryRunStubCapture {
  args: Record<string, unknown> | null;
  calls: number;
}

function createDryRunMcpStub(label: string, capture: DryRunStubCapture): McpClientLike {
  return {
    async connect(): Promise<void> {
      // No transport open — this stub is in-process.
    },
    async listTools() {
      return {
        tools: [
          {
            name: "submit_score",
            description:
              "Submit a score as a verified agent. [DRY-RUN STUB: mirrors @skillos/mcp submit_score input schema; returns synthetic success without SIWA / chain broadcast.]",
            inputSchema: DRY_RUN_SUBMIT_SCORE_SCHEMA as unknown as Record<string, unknown>,
          },
        ],
      };
    },
    async callTool(req: { name: string; arguments?: Record<string, unknown> }) {
      capture.calls += 1;
      if (req.name !== "submit_score") {
        return {
          content: [{ type: "text", text: `Unknown tool "${req.name}" in dry-run stub.` }],
          isError: true,
        };
      }
      capture.args = req.arguments ?? {};
      const synthetic = {
        txHash: `0x${"dryrun".padEnd(64, "0")}`,
        soloRunId: `0x${"dryrun".padEnd(64, "a")}`,
        tier: capture.args.tier ?? "T0",
        note: `DRY-RUN STUB (${label}): args captured; no SIWA, no HTTP, no chain broadcast.`,
        receivedArgs: capture.args,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(synthetic, null, 2) }],
      };
    },
    async close(): Promise<void> {
      // No transport to close.
    },
  };
}

interface AgentLegResult {
  label: AgentBundle["label"];
  model: string;
  tokenUsage: TokenUsage;
  costEstimateUsd: number;
  iterations: number;
  stoppedReason: "no_more_tool_calls" | "max_iterations";
  finalContent: string | null;
  claimedSubmission: { tournamentId: string; score: number; tier: string } | null;
  toolCallCount: number;
}

async function runAgentLegDryRun(args: {
  label: AgentBundle["label"];
  model: string;
  tournamentId: Hex;
  openrouterApiKey: string;
}): Promise<AgentLegResult> {
  const capture: DryRunStubCapture = { args: null, calls: 0 };
  const stub = createDryRunMcpStub(args.label, capture);
  const client = createHermesMcpClient(
    {
      openrouterApiKey: args.openrouterApiKey,
      model: args.model,
      costWarningThresholdUsd: 5,
      clientName: `x25-demo-${args.label}`,
    },
    {
      // Transport config is required by the factory but ignored when `_mcp` is
      // supplied — the stub's `connect()` is a no-op. We still pass a
      // syntactically valid stdio config so `createTransport()` (called
      // eagerly inside `connect()`) constructs a Transport object without
      // spawning anything.
      transport: {
        kind: "stdio",
        command: "node",
        args: ["./packages/mcp/dist/index.js"],
      },
      _mcp: stub,
    },
  );

  await client.connect();
  let result: Awaited<ReturnType<typeof client.run>>;
  try {
    result = await client.run(AGENT_USER_PROMPT, {
      systemPrompt: AGENT_SYSTEM_PROMPT(args.label, args.tournamentId),
      maxIterations: 5,
    });
  } finally {
    await client.close();
  }

  // Cost overlay: wrapper estimates only Hermes ids natively; Claude/Anthropic
  // models go through our local pricing table.
  const wrapperCost = result.usage.estimatedCostUsd;
  const localCost = overlayCostUsd(args.model, result.usage.promptTokens, result.usage.completionTokens);
  const costEstimateUsd = wrapperCost > 0 ? wrapperCost : localCost;

  const claimedSubmission: AgentLegResult["claimedSubmission"] =
    capture.args &&
    typeof capture.args["tournamentId"] === "string" &&
    typeof capture.args["score"] === "number"
      ? {
          tournamentId: capture.args["tournamentId"] as string,
          score: capture.args["score"] as number,
          tier: typeof capture.args["tier"] === "string" ? (capture.args["tier"] as string) : "T0",
        }
      : null;

  return {
    label: args.label,
    model: args.model,
    tokenUsage: { ...result.usage, estimatedCostUsd: costEstimateUsd },
    costEstimateUsd,
    iterations: result.iterations,
    stoppedReason: result.stoppedReason,
    finalContent: result.finalContent,
    claimedSubmission,
    toolCallCount: capture.calls,
  };
}

// ─── X32-2: broadcast-path agent leg (real stdio MCP transport) ───────────

import { Client } from "@modelcontextprotocol/sdk/client/index.js";

interface BroadcastSubmitCapture {
  args: Record<string, unknown> | null;
  resultText: string | null;
  parsedResult: { txHash?: string; soloRunId?: string; [k: string]: unknown } | null;
  toolCalls: number;
  errored: boolean;
}

/**
 * Wrap a real @modelcontextprotocol/sdk Client as an McpClientLike whose
 * `callTool` intercepts `submit_score` results (so we can recover the
 * API-returned txHash + soloRunId) and otherwise delegates straight through.
 * The transport spawned by the wrapper (`createTransport(factoryOpts.transport)`)
 * is the real Stdio child process talking to `packages/mcp/dist/index.js`.
 */
function createCapturingMcpWrapper(capture: BroadcastSubmitCapture): McpClientLike {
  const realClient = new Client(
    { name: "x25-broadcast-demo", version: "0.1.0" },
    { capabilities: {} },
  );
  return {
    async connect(transport: unknown): Promise<void> {
      // The wrapper hands us a real StdioClientTransport instance. Just delegate.
      await (realClient as unknown as { connect: (t: unknown) => Promise<void> }).connect(transport);
    },
    async listTools() {
      const out = await realClient.listTools();
      return out as unknown as { tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }> };
    },
    async callTool(req: { name: string; arguments?: Record<string, unknown> }) {
      capture.toolCalls += 1;
      try {
        const out = await realClient.callTool(req as never);
        if (req.name === "submit_score") {
          capture.args = req.arguments ?? {};
          // Surface the text payload back to the caller — the SDK packs the
          // server's JSON-stringified result inside `content[0].text`.
          const contentArr = (out as { content?: Array<{ type: string; text?: string }> }).content;
          const text = Array.isArray(contentArr) && contentArr[0]?.type === "text" ? contentArr[0].text ?? null : null;
          capture.resultText = text;
          if (text) {
            try {
              capture.parsedResult = JSON.parse(text) as BroadcastSubmitCapture["parsedResult"];
            } catch {
              capture.parsedResult = null;
            }
          }
          const isErr = (out as { isError?: boolean }).isError;
          if (isErr) capture.errored = true;
        }
        return out as never;
      } catch (e) {
        if (req.name === "submit_score") {
          capture.errored = true;
          capture.resultText = `EXCEPTION: ${(e as Error).message}`;
        }
        throw e;
      }
    },
    async close(): Promise<void> {
      await realClient.close();
    },
  };
}

interface AgentLegBroadcastResult extends AgentLegResult {
  submitTxHash: Hex | null;
  submitTxConfirmed: boolean;
  soloRunId: string | null;
  mcpResultText: string | null;
}

async function runAgentLegBroadcast(args: {
  agent: AgentBundle;
  model: string;
  tournamentId: Hex;
  openrouterApiKey: string;
  publicClient: PublicClientT;
}): Promise<AgentLegBroadcastResult> {
  if (args.agent.agentId === null) {
    throw new Error(`[x32-2] ${args.agent.label}: agentId is null — register must run first`);
  }
  const capture: BroadcastSubmitCapture = {
    args: null,
    resultText: null,
    parsedResult: null,
    toolCalls: 0,
    errored: false,
  };
  const wrapped = createCapturingMcpWrapper(capture);

  // Spawn @skillos/mcp with this agent's credentials so submit_score → API
  // signs SIWA + ERC-8128 as this agent. Each agent gets a fresh subprocess
  // (no shared state between legs).
  const mcpServerPath = resolve(process.cwd(), "packages/mcp/dist/index.js");
  const client = createHermesMcpClient(
    {
      openrouterApiKey: args.openrouterApiKey,
      model: args.model,
      costWarningThresholdUsd: 5,
      clientName: `x32-2-broadcast-${args.agent.label}`,
    },
    {
      transport: {
        kind: "stdio",
        command: process.execPath, // current node binary
        args: [mcpServerPath],
        env: {
          // Inherit critical vars for the child env minimally — do NOT leak
          // STUDIO_PRIVATE_KEY into agent subprocess (server-broadcast path
          // belongs to api.skillos.network, not the local MCP server).
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          SKILLOS_ENV: "testnet",
          SKILLOS_PRIVATE_KEY: args.agent.privateKey,
          SKILLOS_AGENT_ID: String(args.agent.agentId),
          SKILLOS_BASE_URL: process.env.SKILLOS_BASE_URL ?? "https://api.skillos.network",
          SKILLOS_RPC_URL: rpcUrl(),
        },
      },
      _mcp: wrapped,
    },
  );

  await client.connect();
  let result: Awaited<ReturnType<typeof client.run>>;
  try {
    result = await client.run(AGENT_USER_PROMPT, {
      systemPrompt: AGENT_SYSTEM_PROMPT(args.agent.label, args.tournamentId),
      maxIterations: 5,
    });
  } finally {
    await client.close();
  }

  const wrapperCost = result.usage.estimatedCostUsd;
  const localCost = overlayCostUsd(args.model, result.usage.promptTokens, result.usage.completionTokens);
  const costEstimateUsd = wrapperCost > 0 ? wrapperCost : localCost;

  const claimedSubmission: AgentLegResult["claimedSubmission"] =
    capture.args &&
    typeof capture.args["tournamentId"] === "string" &&
    typeof capture.args["score"] === "number"
      ? {
          tournamentId: capture.args["tournamentId"] as string,
          score: capture.args["score"] as number,
          tier: typeof capture.args["tier"] === "string" ? (capture.args["tier"] as string) : "T0",
        }
      : null;

  // Pull the txHash from the parsed MCP result. SkillOS API returns
  // `{ txHash, soloRunId, ... }` per the submit_score handler comment.
  const parsed = capture.parsedResult;
  const submitTxHash: Hex | null =
    parsed && typeof parsed["txHash"] === "string" && /^0x[a-fA-F0-9]{64}$/.test(parsed["txHash"] as string)
      ? (parsed["txHash"] as Hex)
      : null;
  const soloRunId =
    parsed && typeof parsed["soloRunId"] === "string" ? (parsed["soloRunId"] as string) : null;

  // Confirm the API-broadcast tx is mined before downstream effectiveScoreOf
  // reads see the new score. SkillOS API broadcasts fire-and-forget, so we
  // explicitly wait here.
  let submitTxConfirmed = false;
  if (submitTxHash) {
    try {
      const receipt = await args.publicClient.waitForTransactionReceipt({
        hash: submitTxHash,
        timeout: 180_000,
        confirmations: 1,
      });
      submitTxConfirmed = receipt.status === "success";
    } catch {
      submitTxConfirmed = false;
    }
  }

  return {
    label: args.agent.label,
    model: args.model,
    tokenUsage: { ...result.usage, estimatedCostUsd: costEstimateUsd },
    costEstimateUsd,
    iterations: result.iterations,
    stoppedReason: result.stoppedReason,
    finalContent: result.finalContent,
    claimedSubmission,
    toolCallCount: capture.toolCalls,
    submitTxHash,
    submitTxConfirmed,
    soloRunId,
    mcpResultText: capture.resultText,
  };
}

// ─── Step 7: settle(id, sortedRanking) — post-window-close ─────────────────

/**
 * Build sortedRanking by reading effectiveScoreOf for each participant.
 * Sort descending; ties preserve participant index order (matches the
 * settle-guard contract invariant; mirrored from
 * packages/duel-backend/src/cron/tournaments.ts line ~1013).
 */
async function buildSortedRanking(
  publicClient: PublicClientT,
  tournamentId: Hex,
): Promise<Address[]> {
  const participants = (await publicClient.readContract({
    address: TOURNAMENT_POOL_V2_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    functionName: "getParticipants",
    args: [tournamentId],
  })) as Address[];

  if (participants.length === 0) return [];

  const scored = await Promise.all(
    participants.map(async (player) => {
      const score = (await publicClient.readContract({
        address: TOURNAMENT_POOL_V2_ADDRESS,
        abi: TOURNAMENT_POOL_ABI,
        functionName: "effectiveScoreOf",
        args: [tournamentId, player],
      })) as bigint;
      return { player, score };
    }),
  );

  scored.sort((a, b) => {
    if (a.score === b.score) return 0;
    return a.score > b.score ? -1 : 1;
  });
  return scored.map((s) => s.player);
}

async function settleTournament(
  deployer: WalletClientT,
  publicClient: PublicClientT,
  tournamentId: Hex,
): Promise<{ txHash: Hex; sortedRanking: Address[]; totalDistributed: bigint; refunded: bigint }> {
  if (!deployer.account) throw new Error("deployer client has no account");
  const sortedRanking = await buildSortedRanking(publicClient, tournamentId);

  const txHash = await deployer.writeContract({
    address: TOURNAMENT_POOL_V2_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    functionName: "settle",
    args: [tournamentId, sortedRanking],
    account: deployer.account,
    chain: baseSepolia,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 180_000 });
  if (receipt.status !== "success") {
    throw new Error(`[x25] settle reverted: ${txHash}`);
  }
  const logs = parseEventLogs({
    abi: TOURNAMENT_POOL_ABI,
    logs: receipt.logs,
    eventName: "TournamentSettled",
  });
  if (logs.length === 0) {
    throw new Error(`[x25] settle ${txHash} emitted no TournamentSettled event`);
  }
  const { totalDistributed, refunded } = logs[0]!.args as {
    totalDistributed: bigint;
    refunded: bigint;
  };
  return { txHash, sortedRanking, totalDistributed, refunded };
}

// ─── Output artifact ───────────────────────────────────────────────────────

interface AgentArtifact {
  label: AgentBundle["label"];
  model: string;
  tokenUsage: TokenUsage;
  costEstimateUsd: number;
  iterations: number;
  stoppedReason: "no_more_tool_calls" | "max_iterations";
  finalContent: string | null;
  claimedSubmission: { tournamentId: string; score: number; tier: string } | null;
  toolCallCount: number;
}

interface DemoArtifact {
  mode: "DRY-RUN" | "BROADCAST";
  generatedAt: string;
  chainId: number;
  rpcUrl: string;
  deployer: Address;
  game: typeof GAME;
  tournamentId: Hex;
  tournamentWindow: { startsAt: number; endsAt: number; durationMin: number };
  prizePool: {
    seedUsdc: string;
    sponsorTopupUsdc: string;
    totalUsdc: string;
    receiptTokenId: string | null;
  };
  agents: Array<{
    label: AgentBundle["label"];
    address: Address;
    agentId: string | null;
    endpoint: string;
    registerTxHash: Hex | null;
    fundEthTxHash: Hex | null;
    fundUsdcTxHash: Hex | null;
  }>;
  txHashes: {
    fundEth: Record<string, Hex | null>;
    fundUsdc: Record<string, Hex | null>;
    register: Record<string, Hex | null>;
    create: Hex | null;
    sponsor: Hex | null;
    settle: Hex | null;
  };
  settle: {
    sortedRanking: Address[] | null;
    totalDistributed: string | null;
    refunded: string | null;
  };
  /**
   * Per-agent submission + LLM telemetry. In dry-run, populated by the X29
   * wrapper integration (model name, token usage, cost estimate, captured
   * claimed score). In broadcast (current sprint defers wiring), null.
   */
  hermesAgent: AgentArtifact | null;
  claudeAgent: AgentArtifact | null;
  basescanUrls: {
    tournament: string;
    sponsorshipModule: string;
    sponsorReceiptSbt: string;
    identityRegistry: string;
  };
  /**
   * Blockscout URLs — sprint spec calls out Blockscout as the demo-video
   * explorer of record. Per-tx links populated only in BROADCAST mode.
   */
  blockscoutUrls: {
    tournament: string;
    sponsorshipModule: string;
    sponsorReceiptSbt: string;
    identityRegistry: string;
    submissionTxs: Record<string, string | null>;
    settleTx: string | null;
    sponsorTx: string | null;
    createTx: string | null;
  };
  leaderboardUrl: string;
  profileUrls: Record<string, string>;
}

const BLOCKSCOUT_BASE = "https://base-sepolia.blockscout.com";
const blockscoutTxUrl = (h: Hex | null): string | null => (h ? `${BLOCKSCOUT_BASE}/tx/${h}` : null);
const blockscoutAddrUrl = (a: Address): string => `${BLOCKSCOUT_BASE}/address/${a}`;

function writeArtifact(artifact: DemoArtifact): string {
  const outDir = process.env.HERMES_DEMO_OUTPUT_DIR ?? resolve(process.cwd(), "scripts/output");
  mkdirSync(outDir, { recursive: true });
  const ts = artifact.generatedAt.replace(/[:.]/g, "-");
  const path = resolve(outDir, `hermes-demo-${ts}.json`);
  writeFileSync(path, JSON.stringify(artifact, null, 2));
  return path;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = BROADCAST ? "BROADCAST" : "DRY-RUN";
  console.log(`\n=== X25 Hermes vs Claude Demo Orchestrator (${mode}) ===\n`);
  console.log(`game=${GAME}  duration=${DURATION_MIN}min  chainId=${BASE_SEPOLIA_CHAIN_ID}`);
  console.log(`prize plan: seed ${formatUnits(SEED_PRIZE_USDC, 6)} + sponsor ${formatUnits(SPONSOR_TOPUP_USDC, 6)} = ${formatUnits(TOTAL_PRIZE_USDC, 6)} USDC\n`);

  // ─── Deployer / studio signer ────────────────────────────────────────────
  const studioPk = process.env.STUDIO_PRIVATE_KEY;
  if (!studioPk || !/^0x[a-fA-F0-9]{64}$/.test(studioPk)) {
    throw new Error("STUDIO_PRIVATE_KEY env required (0x-prefixed 32-byte hex)");
  }
  const deployer = makeWalletClient(studioPk as Hex);
  if (!deployer.account) throw new Error("deployer client has no account");
  const publicClient = makePublicClient();
  console.log(`[x25] deployer=${deployer.account.address}`);

  // Balance sanity check (always run, even in dry-run, so the founder sees a clear "not enough" signal).
  const deployerEth = await publicClient.getBalance({ address: deployer.account.address });
  const deployerUsdc = (await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [deployer.account.address],
  })) as bigint;
  const usdcNeeded = TOTAL_PRIZE_USDC + AGENT_USDC * 2n;
  const ethNeeded = AGENT_GAS_ETH * 2n + 10_000_000_000_000_000n; // 2 fundings + ~0.01 ETH gas headroom
  console.log(`[x25] deployer balances: ${formatEther(deployerEth)} ETH, ${formatUnits(deployerUsdc, 6)} USDC`);
  console.log(`[x25] need: ${formatEther(ethNeeded)} ETH (gas+fund), ${formatUnits(usdcNeeded, 6)} USDC (prize+fund)`);
  if (deployerEth < ethNeeded) {
    console.warn(`[x25] WARNING: deployer ETH below estimated need (${formatEther(deployerEth)} < ${formatEther(ethNeeded)})`);
  }
  if (deployerUsdc < usdcNeeded) {
    console.warn(`[x25] WARNING: deployer USDC below estimated need (${formatUnits(deployerUsdc, 6)} < ${formatUnits(usdcNeeded, 6)})`);
  }

  // ─── Step 1: generate agent bundles ──────────────────────────────────────
  const hermes = generateAgentBundle("hermes");
  const claude = generateAgentBundle("claude");
  const bundles: AgentBundle[] = [hermes, claude];
  console.log(`[x25] agents:`);
  for (const b of bundles) console.log(`   ${b.label}: ${b.address}`);

  // ─── Compute tournament id (timing-deterministic) ────────────────────────
  const nowSec = Math.floor(Date.now() / 1000);
  const startsAt = nowSec + START_BUFFER_SEC;
  const endsAt = startsAt + DURATION_SEC;
  const tournamentId = deriveTournamentId(GAME, CYCLE_WEEKLY, startsAt);
  console.log(`[x25] tournamentId=${tournamentId}`);
  console.log(`[x25] window: ${new Date(startsAt * 1000).toISOString()} → ${new Date(endsAt * 1000).toISOString()}\n`);

  // ─── Dry-run composition: emit all planned tx params, broadcast none ─────
  if (!BROADCAST) {
    console.log("--- DRY-RUN: COMPOSED CALLS (no broadcast) ---\n");

    for (const b of bundles) {
      console.log(`[x25][${b.label}] fundEth: send ${formatEther(AGENT_GAS_ETH)} ETH → ${b.address}`);
      console.log(`[x25][${b.label}] fundUsdc: transfer ${formatUnits(AGENT_USDC, 6)} USDC → ${b.address}`);
      const agentURI = buildAgentURI(b.label, b.endpoint);
      const calldata = encodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "register",
        args: [agentURI],
      });
      console.log(`[x25][${b.label}] register: IdentityRegistry.register(agentURI), calldata=${calldata.slice(0, 32)}...`);
    }

    console.log(`\n[x25] createTournament: prizePool=${formatUnits(SEED_PRIZE_USDC, 6)} USDC seed (deployer)`);
    console.log(`[x25] sponsorPool: top-up=${formatUnits(SPONSOR_TOPUP_USDC, 6)} USDC → total ${formatUnits(TOTAL_PRIZE_USDC, 6)} USDC prize (deployer)`);
    console.log(`[x25] settle: post-window-close, deployer signs settle(id, sortedRanking)`);
    console.log(`[x25] sortedRanking built from on-chain effectiveScoreOf reads`);

    // ─── X32: exercise the X29 wrapper end-to-end against stubbed @skillos/mcp ───
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      throw new Error(
        "OPENROUTER_API_KEY env required for dry-run wrapper integration. " +
          "Source it before running (e.g. `set -a; source .env.demo; set +a`).",
      );
    }
    console.log(`\n--- DRY-RUN: agent legs via @skillos/hermes-mcp-wrapper (stubbed MCP) ---\n`);
    console.log(`[x25] hermes leg: model=${OPEN_WEIGHTS_MODEL} (open-weights; Hermes routing on OpenRouter has tools:false — see PR description)`);
    console.log(`[x25] claude leg: model=${CLAUDE_MODEL}`);
    console.log(`[x25] mcp transport: in-process stub (mirrors @skillos/mcp submit_score schema; no broadcast)`);

    const hermesLeg = await runAgentLegDryRun({
      label: "hermes",
      model: OPEN_WEIGHTS_MODEL,
      tournamentId,
      openrouterApiKey,
    });
    console.log(
      `[x25][hermes] iterations=${hermesLeg.iterations} stop=${hermesLeg.stoppedReason} ` +
        `tokens=${hermesLeg.tokenUsage.totalTokens} cost≈$${hermesLeg.costEstimateUsd.toFixed(6)}`,
    );
    if (hermesLeg.claimedSubmission) {
      console.log(
        `[x25][hermes] claimed score=${hermesLeg.claimedSubmission.score} (tier ${hermesLeg.claimedSubmission.tier})`,
      );
    } else {
      console.log(`[x25][hermes] no claimed submission captured (toolCalls=${hermesLeg.toolCallCount})`);
    }

    const claudeLeg = await runAgentLegDryRun({
      label: "claude",
      model: CLAUDE_MODEL,
      tournamentId,
      openrouterApiKey,
    });
    console.log(
      `[x25][claude] iterations=${claudeLeg.iterations} stop=${claudeLeg.stoppedReason} ` +
        `tokens=${claudeLeg.tokenUsage.totalTokens} cost≈$${claudeLeg.costEstimateUsd.toFixed(6)}`,
    );
    if (claudeLeg.claimedSubmission) {
      console.log(
        `[x25][claude] claimed score=${claudeLeg.claimedSubmission.score} (tier ${claudeLeg.claimedSubmission.tier})`,
      );
    } else {
      console.log(`[x25][claude] no claimed submission captured (toolCalls=${claudeLeg.toolCallCount})`);
    }

    const combinedCost = hermesLeg.costEstimateUsd + claudeLeg.costEstimateUsd;
    console.log(`\n[x25] combined estimated cost: $${combinedCost.toFixed(6)} (both legs, dry-run)`);
    console.log(`\n[x25] DRY-RUN complete. Re-run with --broadcast to send all txs.\n`);

    // Emit artifact even in dry-run for review.
    const artifact: DemoArtifact = {
      mode: "DRY-RUN",
      generatedAt: new Date().toISOString(),
      chainId: BASE_SEPOLIA_CHAIN_ID,
      rpcUrl: rpcUrl(),
      deployer: deployer.account.address,
      game: GAME,
      tournamentId,
      tournamentWindow: { startsAt, endsAt, durationMin: DURATION_MIN },
      prizePool: {
        seedUsdc: SEED_PRIZE_USDC.toString(),
        sponsorTopupUsdc: SPONSOR_TOPUP_USDC.toString(),
        totalUsdc: TOTAL_PRIZE_USDC.toString(),
        receiptTokenId: null,
      },
      agents: bundles.map((b) => ({
        label: b.label,
        address: b.address,
        agentId: null,
        endpoint: b.endpoint,
        registerTxHash: null,
        fundEthTxHash: null,
        fundUsdcTxHash: null,
      })),
      txHashes: {
        fundEth: { hermes: null, claude: null },
        fundUsdc: { hermes: null, claude: null },
        register: { hermes: null, claude: null },
        create: null,
        sponsor: null,
        settle: null,
      },
      settle: { sortedRanking: null, totalDistributed: null, refunded: null },
      hermesAgent: hermesLeg,
      claudeAgent: claudeLeg,
      basescanUrls: {
        tournament: `https://sepolia.basescan.org/address/${TOURNAMENT_POOL_V2_ADDRESS}`,
        sponsorshipModule: `https://sepolia.basescan.org/address/${SPONSORSHIP_MODULE_ADDRESS}`,
        sponsorReceiptSbt: `https://sepolia.basescan.org/address/${SPONSOR_RECEIPT_SBT_ADDRESS}`,
        identityRegistry: `https://sepolia.basescan.org/address/${IDENTITY_REGISTRY_ADDRESS}`,
      },
      blockscoutUrls: {
        tournament: blockscoutAddrUrl(TOURNAMENT_POOL_V2_ADDRESS),
        sponsorshipModule: blockscoutAddrUrl(SPONSORSHIP_MODULE_ADDRESS),
        sponsorReceiptSbt: blockscoutAddrUrl(SPONSOR_RECEIPT_SBT_ADDRESS),
        identityRegistry: blockscoutAddrUrl(IDENTITY_REGISTRY_ADDRESS),
        submissionTxs: Object.fromEntries(bundles.map((b) => [b.label, null])),
        settleTx: null,
        sponsorTx: null,
        createTx: null,
      },
      leaderboardUrl: `https://match3.skillos.games/tournament/${tournamentId}`,
      profileUrls: Object.fromEntries(
        bundles.map((b) => [b.label, `https://match3.skillos.games/agent/${b.address}`]),
      ),
    };
    const out = writeArtifact(artifact);
    console.log(`[x25] dry-run artifact: ${out}`);

    // Persist agent keys to .env.demo even in dry-run (founder will re-use them).
    const envDemoPath = resolve(process.cwd(), ".env.demo");
    if (existsSync(envDemoPath)) {
      console.log(`[x25] .env.demo already exists; NOT overwriting. Delete + rerun to refresh.`);
    } else {
      persistEnvDemo(bundles, envDemoPath);
      console.log(`[x25] .env.demo written (mode 0600).`);
    }
    return;
  }

  // ─── BROADCAST PATH ──────────────────────────────────────────────────────
  console.log("--- BROADCAST: live txs on Base Sepolia ---\n");

  // Step 2: fund each agent (ETH only — X32-2 skips USDC funding; agents
  // don't need USDC for the submit_score flow which goes through the API,
  // and the deployer USDC budget is reserved entirely for the $40 pool).
  for (const b of bundles) {
    b.fundEthTxHash = await fundAgentEth(deployer, publicClient, b);
    console.log(`[x25][${b.label}] fundEth tx: ${b.fundEthTxHash}`);
    if (AGENT_USDC > 0n) {
      b.fundUsdcTxHash = await fundAgentUsdc(deployer, publicClient, b);
      console.log(`[x25][${b.label}] fundUsdc tx: ${b.fundUsdcTxHash}`);
    } else {
      console.log(`[x25][${b.label}] fundUsdc: SKIPPED (AGENT_USDC=0; submit_score is API-broadcast, agents need ETH only)`);
    }
  }

  // Step 3: register each agent (uses agent's own wallet).
  for (const b of bundles) {
    const { agentId, txHash } = await registerAgent(b, publicClient);
    b.agentId = agentId;
    b.registerTxHash = txHash;
    console.log(`[x25][${b.label}] register tx: ${txHash} → agentId=${agentId}`);
  }

  // Persist env.demo with agentIds populated.
  persistEnvDemo(bundles, resolve(process.cwd(), ".env.demo"));

  // Step 4: create tournament with seed prize pool.
  const createTxHash = await createTournament(deployer, publicClient, tournamentId, startsAt, endsAt);
  console.log(`[x25] createTournament tx: ${createTxHash}`);

  // Step 5: sponsorPool top-up + SBT mint.
  const { txHash: sponsorTxHash, receiptTokenId } = await sponsorPoolTopup(deployer, publicClient, tournamentId);
  console.log(`[x25] sponsorPool tx: ${sponsorTxHash} → receiptTokenId=${receiptTokenId}`);

  // Step 6: live agent submissions via @skillos/hermes-mcp-wrapper.
  // X32-2: both legs spawn real @skillos/mcp stdio subprocesses; each agent's
  // `submit_score` tool call POSTs to api.skillos.network /v1/agents/scores,
  // which signs + broadcasts the on-chain attestation server-side and returns
  // the unconfirmed txHash. The wrapper-around-real-Client (createCapturing-
  // McpWrapper) intercepts the tool result text so we capture txHash +
  // soloRunId without forking the wrapper's agentic loop. Each leg waits
  // on-chain confirmation before the next step.
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterApiKey) {
    throw new Error(
      "OPENROUTER_API_KEY env required for --broadcast agent legs. " +
        "Source it before running (e.g. `set -a; source .env.demo; set +a`).",
    );
  }

  // Wait until startsAt before submission — the contract enforces tournament
  // is active. startsAt was set with a 60s buffer above; account for the time
  // already consumed by funding + register + create + sponsor.
  {
    const waitToStartMs = Math.max(0, startsAt * 1000 - Date.now()) + 2_000;
    if (waitToStartMs > 0) {
      console.log(`\n[x32-2] sleeping ${Math.round(waitToStartMs / 1000)}s until startsAt...`);
      await new Promise((r) => setTimeout(r, waitToStartMs));
    }
  }

  console.log(`\n--- BROADCAST: agent legs via @skillos/hermes-mcp-wrapper (real stdio MCP) ---\n`);
  console.log(`[x32-2] hermes leg: model=${OPEN_WEIGHTS_MODEL}`);
  console.log(`[x32-2] claude leg: model=${CLAUDE_MODEL}`);
  console.log(`[x32-2] mcp transport: stdio → node packages/mcp/dist/index.js (per-agent env)`);

  const hermesLeg = await runAgentLegBroadcast({
    agent: hermes,
    model: OPEN_WEIGHTS_MODEL,
    tournamentId,
    openrouterApiKey,
    publicClient,
  });
  console.log(
    `[x32-2][hermes] iterations=${hermesLeg.iterations} stop=${hermesLeg.stoppedReason} ` +
      `tokens=${hermesLeg.tokenUsage.totalTokens} cost≈$${hermesLeg.costEstimateUsd.toFixed(6)}`,
  );
  console.log(`[x32-2][hermes] submitTx=${hermesLeg.submitTxHash ?? "<none>"} confirmed=${hermesLeg.submitTxConfirmed}`);
  if (hermesLeg.claimedSubmission) {
    console.log(`[x32-2][hermes] claimed score=${hermesLeg.claimedSubmission.score} (tier ${hermesLeg.claimedSubmission.tier})`);
  }

  const claudeLeg = await runAgentLegBroadcast({
    agent: claude,
    model: CLAUDE_MODEL,
    tournamentId,
    openrouterApiKey,
    publicClient,
  });
  console.log(
    `[x32-2][claude] iterations=${claudeLeg.iterations} stop=${claudeLeg.stoppedReason} ` +
      `tokens=${claudeLeg.tokenUsage.totalTokens} cost≈$${claudeLeg.costEstimateUsd.toFixed(6)}`,
  );
  console.log(`[x32-2][claude] submitTx=${claudeLeg.submitTxHash ?? "<none>"} confirmed=${claudeLeg.submitTxConfirmed}`);
  if (claudeLeg.claimedSubmission) {
    console.log(`[x32-2][claude] claimed score=${claudeLeg.claimedSubmission.score} (tier ${claudeLeg.claimedSubmission.tier})`);
  }

  const combinedCost = hermesLeg.costEstimateUsd + claudeLeg.costEstimateUsd;
  console.log(`\n[x32-2] combined LLM cost: $${combinedCost.toFixed(6)} (both legs, broadcast)`);

  // Step 7: settle. Always broadcast settle in X32-2 (sprint demands end-to-end
  // artifact). Wait until past endsAt, then settle(id, sortedRanking).
  let settleResult: { txHash: Hex; sortedRanking: Address[]; totalDistributed: bigint; refunded: bigint } | null = null;
  {
    const waitToEndMs = Math.max(0, endsAt * 1000 - Date.now()) + 5_000;
    if (waitToEndMs > 0) {
      console.log(`\n[x32-2] sleeping ${Math.round(waitToEndMs / 1000)}s until past endsAt before settle...`);
      await new Promise((r) => setTimeout(r, waitToEndMs));
    }
    settleResult = await settleTournament(deployer, publicClient, tournamentId);
    console.log(`[x32-2] settle tx: ${settleResult.txHash}`);
    console.log(`[x32-2] totalDistributed=${formatUnits(settleResult.totalDistributed, 6)} USDC, refunded=${formatUnits(settleResult.refunded, 6)} USDC`);
  }

  // Final artifact.
  const artifact: DemoArtifact = {
    mode: "BROADCAST",
    generatedAt: new Date().toISOString(),
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: rpcUrl(),
    deployer: deployer.account.address,
    game: GAME,
    tournamentId,
    tournamentWindow: { startsAt, endsAt, durationMin: DURATION_MIN },
    prizePool: {
      seedUsdc: SEED_PRIZE_USDC.toString(),
      sponsorTopupUsdc: SPONSOR_TOPUP_USDC.toString(),
      totalUsdc: TOTAL_PRIZE_USDC.toString(),
      receiptTokenId: receiptTokenId.toString(),
    },
    agents: bundles.map((b) => ({
      label: b.label,
      address: b.address,
      agentId: b.agentId?.toString() ?? null,
      endpoint: b.endpoint,
      registerTxHash: b.registerTxHash,
      fundEthTxHash: b.fundEthTxHash,
      fundUsdcTxHash: b.fundUsdcTxHash,
    })),
    txHashes: {
      fundEth: { hermes: hermes.fundEthTxHash, claude: claude.fundEthTxHash },
      fundUsdc: { hermes: hermes.fundUsdcTxHash, claude: claude.fundUsdcTxHash },
      register: { hermes: hermes.registerTxHash, claude: claude.registerTxHash },
      create: createTxHash,
      sponsor: sponsorTxHash,
      settle: settleResult?.txHash ?? null,
    },
    settle: {
      sortedRanking: settleResult?.sortedRanking ?? null,
      totalDistributed: settleResult?.totalDistributed.toString() ?? null,
      refunded: settleResult?.refunded.toString() ?? null,
    },
    // X32-2: wrapper wiring is live for both legs over real stdio MCP.
    hermesAgent: hermesLeg,
    claudeAgent: claudeLeg,
    basescanUrls: {
      tournament: `https://sepolia.basescan.org/address/${TOURNAMENT_POOL_V2_ADDRESS}`,
      sponsorshipModule: `https://sepolia.basescan.org/address/${SPONSORSHIP_MODULE_ADDRESS}`,
      sponsorReceiptSbt: `https://sepolia.basescan.org/address/${SPONSOR_RECEIPT_SBT_ADDRESS}`,
      identityRegistry: `https://sepolia.basescan.org/address/${IDENTITY_REGISTRY_ADDRESS}`,
    },
    blockscoutUrls: {
      tournament: blockscoutAddrUrl(TOURNAMENT_POOL_V2_ADDRESS),
      sponsorshipModule: blockscoutAddrUrl(SPONSORSHIP_MODULE_ADDRESS),
      sponsorReceiptSbt: blockscoutAddrUrl(SPONSOR_RECEIPT_SBT_ADDRESS),
      identityRegistry: blockscoutAddrUrl(IDENTITY_REGISTRY_ADDRESS),
      submissionTxs: {
        hermes: blockscoutTxUrl(hermesLeg.submitTxHash),
        claude: blockscoutTxUrl(claudeLeg.submitTxHash),
      },
      settleTx: blockscoutTxUrl(settleResult?.txHash ?? null),
      sponsorTx: blockscoutTxUrl(sponsorTxHash),
      createTx: blockscoutTxUrl(createTxHash),
    },
    leaderboardUrl: `https://match3.skillos.games/tournament/${tournamentId}`,
    profileUrls: Object.fromEntries(
      bundles.map((b) => [b.label, `https://match3.skillos.games/agent/${b.address}`]),
    ),
  };
  const out = writeArtifact(artifact);
  console.log(`\n[x32-2] artifact: ${out}`);
  console.log(`\n=== SUCCESS ===\n`);
}

main().catch((err) => {
  console.error("[x25] fatal:", err);
  process.exit(1);
});
