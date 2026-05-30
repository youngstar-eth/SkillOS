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
// X32-4: pull the 2048 engine directly so the dry-run stub can present
// real boards to the LLM and validate scores in-process. The package
// subpath export is built by tsup (see packages/mcp/tsup.config.ts).
import {
  createSession,
  applyMove as engineApplyMove,
  isGameOver as engineIsGameOver,
  serializeBoard,
  MAX_MOVES,
  type GameSession,
  type Direction,
} from "@skillos/mcp/engine/2048";

// ─── Config (founder-confirmed) ────────────────────────────────────────────

// X32-4: switched from "match3" → "2048" to exercise real gameplay through
// the new engine + tools (get_board_state, make_move, submit_score with
// engine validation). 2048 = 4-direction enum, deterministic per-seed,
// simpler tool-use schema, and the launcher UI is replay-ready.
const GAME = "2048" as const;
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

export function deriveTournamentId(
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
    description: `X25 demo agent (${name}) — 2048 on Base Sepolia.`,
    image: "https://skillos.network/agent-default.png",
    services: [{ name: "web", endpoint }],
    active: true,
    supportedTrust: ["reputation"],
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;
}

export function rpcUrl(): string {
  return process.env.BASE_SEPOLIA_RPC_URL ?? DEFAULT_RPC;
}

export function makePublicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl(), { retryCount: 3, retryDelay: 200, timeout: 30_000 }),
  });
}

export function makeWalletClient(pk: Hex) {
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
  // X32-4 clean-broadcast: two open-weights slots. Claude was dropped
  // entirely (was a $3/$15-per-M cost sink, not a demo requirement).
  // Slot names equal the underlying model id family so artifact + log
  // labels self-describe.
  //   mistral  → mistralai/mistral-large-2411
  //   deepseek → deepseek/deepseek-v4-flash
  label: "mistral" | "deepseek";
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

export async function createTournament(
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

export async function sponsorPoolTopup(
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

// X32-4 model selection — final config (post X32-4 clean-broadcast).
//
// Iteration history:
//   X32-3 + X32-4 dry-run #1: meta-llama/llama-3.3-70b-instruct FAILED
//     tool-use twice (105 iter no submit_score, $0.20 burned). Dropped.
//   X32-4 dry-run #2: Mistral Large + Claude Sonnet 4.5 both submitted
//     scores BUT subsequent broadcasts burned $16 total across two
//     stuck-tournament cycles — caused by (a) Claude's $3/$15 per-M
//     pricing, (b) no context windowing (quadratic token growth),
//     (c) no per-leg token cap. Claude dropped from the demo entirely
//     (carryover from "Hermes vs Claude" framing, not a requirement).
//   X32-4 final broadcast (May 28 09:45 UTC): Mistral Large submitted
//     on-chain successfully (score 168, tx 0x850afbfd...). DeepSeek
//     (chat) leg crashed on a transient `read ETIMEDOUT` from the
//     OpenRouter `/chat/completions` socket — a network blip, not a
//     tool-use failure. Tournament settled with Mistral as sole winner
//     (settle tx 0x85f5e2c2..., $40 USDC to agentId 6437).
//   X32-5 fixes:
//     1. Inference call now retries 3× on transient errors (ETIMEDOUT,
//        ECONNRESET, 5xx, fetch socket errors) with exp backoff 1/2/4s.
//        See packages/hermes-mcp-wrapper/src/inference.ts. A single
//        socket blip will no longer crash a leg.
//     2. `deepseek/deepseek-chat` swapped to `deepseek/deepseek-v4-flash`
//        — old endpoint sunsetting on OpenRouter 2026-07-24, V4 Flash
//        supersedes at lower price ($0.10/$0.20 per M) + 1M context.
//
// Final config:
//   Leg 1: `mistralai/mistral-large-2411` — tools: true, $2.00/$6.00
//     per M, validated end-to-end in X32-4 on-chain broadcast.
//   Leg 2: `deepseek/deepseek-v4-flash` — tools: true, ctx 1,048,576,
//     $0.10/$0.20 per M. Fallback chain: deepseek-v4-pro → qwen-2.5-72b.
//
// AgentBundle.label union: "mistral" | "deepseek". Filename, package
// name, wrapper function name (`createHermesMcpClient`) are kept stable
// — those are infrastructure identities, not demo labels.
//
// Verified `tools: true` on OpenRouter /api/v1/models at X32-5 swap:
//   mistralai/mistral-large-2411  — tools: true, ctx 131072
//   deepseek/deepseek-v4-flash    — tools: true, ctx 1048576
//   deepseek/deepseek-v4-pro      — tools: true, ctx 1048576 (fallback)
//   qwen/qwen-2.5-72b-instruct    — tools: true, ctx 131072 (fallback)
const LEG1_MODEL = "mistralai/mistral-large-2411";
const LEG2_MODEL = "deepseek/deepseek-v4-flash";

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
  // X32-5 swap: deepseek-chat sunsetting on OpenRouter 2026-07-24; V4
  // Flash supersedes at lower price ($0.10/$0.20 per M) + 1M context.
  // Keep V4 Pro priced too as the documented fallback target.
  "deepseek/deepseek-v4-flash": { input: 0.1, output: 0.2 },
  "deepseek/deepseek-v4-pro": { input: 0.435, output: 0.87 },
};

function overlayCostUsd(model: string, prompt: number, completion: number): number {
  const rates = OPENROUTER_PRICING_USD_PER_M[model];
  if (!rates) return 0;
  return (prompt * rates.input + completion * rates.output) / 1_000_000;
}

// X32-4: 2048 gameplay loop prompt. Three-tool agentic loop — read board,
// pick direction, repeat until game-over or the soft cap, then submit
// with the recorded move trail. The submit_score tool's engine validation
// rejects any mismatch between the claimed score and the deterministic
// replay, so the LLM cannot "fake" a high score.
//
// SOFT_MOVE_CAP < MAX_MOVES is intentional: a smaller per-run move budget
// keeps total LLM iterations + token cost predictable across both legs
// (smaller open-weights models were observed looping past their iteration
// budget when the soft cap matched MAX_MOVES). The engine still caps at
// MAX_MOVES for replay determinism, but the prompt asks the agent to
// submit by SOFT_MOVE_CAP.
const SOFT_MOVE_CAP = 30;
const AGENT_SYSTEM_PROMPT = (label: string, tournamentId: Hex, sessionId: string): string =>
  [
    `You are an autonomous agent playing 2048 in a SkillOS tournament on Base Sepolia.`,
    `Your agent label is "${label}". Goal: maximize your final score.`,
    ``,
    `Game rules:`,
    `- 4×4 grid of numbered tiles (2, 4, 8, 16, ...). Empty cells are 0.`,
    `- Each move: choose a direction (up | down | left | right). All tiles slide`,
    `  that way. Two adjacent tiles of equal value collide → merge into one tile`,
    `  with their sum, and your score increases by that sum.`,
    `- After every successful move, one new tile (2 or 4) spawns in a random`,
    `  empty cell.`,
    `- Engine hard cap: ${MAX_MOVES} legal moves. Your soft cap for this run:`,
    `  ${SOFT_MOVE_CAP} moves — you MUST submit before exceeding it.`,
    ``,
    `Tournament ID: ${tournamentId}`,
    `Your session ID: ${sessionId}`,
    `Tier: T0 (signature-only submission).`,
    ``,
    `Available tools:`,
    `1. get_board_state({ sessionId }) — returns the current 4×4 board, score,`,
    `   movesUsed, and gameOver flag. Call this ONCE at the start. First call`,
    `   also initializes the session. You do NOT need to call it again between`,
    `   moves — make_move returns the updated board on every call.`,
    `2. make_move({ sessionId, direction }) — applies one direction. Returns the`,
    `   new board, scoreDelta, moved (false = no-op direction, try a different`,
    `   one — the move budget is NOT consumed), gameOver, and movesUsed.`,
    `3. submit_score({ tournamentId, game: "2048", score, sessionId, moves }) —`,
    `   call EXACTLY ONCE at the end. \`moves\` is the chronological array of`,
    `   every direction you successfully applied (excluding no-ops). The server`,
    `   replays the engine and rejects mismatched scores, so be honest.`,
    ``,
    `Strategy hint: keep the largest tile in a corner and avoid scattering tiles`,
    `randomly. Don't deadlock the board too early.`,
    ``,
    `Procedure (FOLLOW STRICTLY):`,
    `- Step 1: get_board_state once to see the opening tiles.`,
    `- Step 2: make_move repeatedly. Each call returns the NEW board — use it.`,
    `- Step 3: STOP making moves when EITHER gameOver === true OR you have`,
    `  successfully applied ${SOFT_MOVE_CAP} moves (whichever comes first).`,
    `- Step 4: call submit_score ONCE. The \`score\` argument MUST be EXACTLY`,
    `  the \`score\` field from your most recent make_move response — do NOT`,
    `  re-derive it, do NOT sum scoreDeltas, do NOT estimate. Copy it`,
    `  verbatim. \`moves\` is the chronological array of every direction`,
    `  argument you passed to make_move (include no-op attempts too — they`,
    `  replay as no-ops on the engine side, so the array can be the full`,
    `  history). The server's engine validation rejects any mismatch.`,
    `- Step 5: write a single concise sentence summary describing the run.`,
    `- On any tool error: surface it verbatim and stop — do not retry.`,
  ].join("\n");

const AGENT_USER_PROMPT = "Play 2048 to game-over and submit your score.";

// Total agentic turns budget: 1 get_board_state + SOFT_MOVE_CAP make_moves
// + 1 submit_score + 1 summary = SOFT_MOVE_CAP + 3. Pad for no-op
// directions and LLM slack.
const AGENT_MAX_ITERATIONS = SOFT_MOVE_CAP + 8;

// X32-4 credit-burn guards (passed to client.run, enforced by the wrapper).
//
// `AGENT_WINDOW_TURNS = 3` — keep the system + user prompts + the last 3
// (assistant + tool) pairs. Without windowing the wrapper sends the full
// growing transcript each turn (quadratic token cost); $16 was burned
// across prior X32-4 runs in part because of this. With windowing, each
// turn is ~constant tokens since the authoritative 2048 state lives in
// the MCP server's session_store — the model only needs the system prompt
// + the most recent make_move result to pick the next direction.
//
// `AGENT_MAX_TOTAL_TOKENS = 800_000` — hard cap per leg. If misbehavior
// blows past this (e.g. infinite tool-call loop) the wrapper exits with
// `stoppedReason: "aborted_budget"` and the trail captured so far is
// preserved.
const AGENT_WINDOW_TURNS = 3;
const AGENT_MAX_TOTAL_TOKENS = 800_000;

// JSON-Schema mirrors of the three tools the 2048 agent loop uses. These
// must match the zod inputSchema in packages/mcp/src/tools/{get_board_state,
// make_move,submit_score}.ts. We keep them inlined here because Claude /
// open-weights tool-use on OpenRouter expects plain JSON-Schema in the
// bridge — the wrapper does not transform zod for us.
const DRY_RUN_GET_BOARD_STATE_SCHEMA = {
  type: "object",
  properties: {
    sessionId: { type: "string", minLength: 1, maxLength: 128 },
  },
  required: ["sessionId"],
  additionalProperties: false,
} as const;

const DRY_RUN_MAKE_MOVE_SCHEMA = {
  type: "object",
  properties: {
    sessionId: { type: "string", minLength: 1, maxLength: 128 },
    direction: { type: "string", enum: ["up", "down", "left", "right"] },
  },
  required: ["sessionId", "direction"],
  additionalProperties: false,
} as const;

const DRY_RUN_SUBMIT_SCORE_SCHEMA = {
  type: "object",
  properties: {
    tournamentId: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{64}$",
      description: "Tournament id (bytes32 hex).",
    },
    game: {
      type: "string",
      enum: ["2048", "wordle", "sudoku", "minesweeper", "clicker", "match3"],
    },
    score: { type: "integer", minimum: 0, description: "Raw player score." },
    tier: { type: "string", enum: ["T0", "T1", "T2", "T3"], description: "Quality tier. v0.1 only supports T0." },
    soloRunId: { type: "string", pattern: "^0x[a-fA-F0-9]{64}$" },
    matchCountDelta: { type: "integer", minimum: 1, maximum: 10 },
    sessionId: { type: "string", minLength: 1, maxLength: 128 },
    moves: {
      type: "array",
      items: { type: "string", enum: ["up", "down", "left", "right"] },
      maxItems: 1000,
    },
  },
  required: ["tournamentId", "game", "score"],
  additionalProperties: false,
} as const;

// One captured turn of gameplay — populated by either the dry-run stub
// (engine is in-process) or the broadcast-path wrapper (engine is in the
// MCP subprocess; we mirror it locally for trail capture).
interface MoveTrailEntry {
  turn: number;
  direction: Direction;
  boardBefore: number[][];
  boardAfter: number[][];
  scoreDelta: number;
  scoreAfter: number;
  moved: boolean;
  gameOver: boolean;
}

interface DryRunStubCapture {
  // submit_score args, captured for downstream artifact emission.
  args: Record<string, unknown> | null;
  // Total tool calls of any kind. Used to verify the loop actually ran.
  calls: number;
  // Full chronological move trail captured by the stub — one entry per
  // successful make_move (no-ops still recorded as moved:false for debug).
  moves: MoveTrailEntry[];
  // Final engine snapshot at submit_score time (or game-over).
  finalScore: number;
  movesUsed: number;
}

/**
 * Dry-run stub: plays a real in-process 2048 engine session so the LLM
 * sees real boards and scores. Mirrors the @skillos/mcp tool surface for
 * get_board_state / make_move / submit_score. No SIWA, no HTTP, no chain.
 */
function createDryRunMcpStub(
  label: string,
  sessionId: string,
  capture: DryRunStubCapture,
): McpClientLike {
  // In-process engine session, keyed by sessionId. The stub manages its own
  // map (not the MCP package's session_store) because dry-run runs entirely
  // outside the MCP server process.
  const sessions = new Map<string, GameSession>();
  return {
    async connect(): Promise<void> {
      // No transport open — this stub is in-process.
    },
    async listTools() {
      return {
        tools: [
          {
            name: "get_board_state",
            description:
              "Read the current 4×4 2048 board for this session. First call auto-creates the session seeded by sessionId. [DRY-RUN STUB]",
            inputSchema: DRY_RUN_GET_BOARD_STATE_SCHEMA as unknown as Record<string, unknown>,
          },
          {
            name: "make_move",
            description:
              "Apply one direction (up/down/left/right) to a 2048 session. Returns the new board + scoreDelta + moved + gameOver. [DRY-RUN STUB]",
            inputSchema: DRY_RUN_MAKE_MOVE_SCHEMA as unknown as Record<string, unknown>,
          },
          {
            name: "submit_score",
            description:
              "Submit the final score with the full move trail. Engine replays the moves and rejects score mismatches. [DRY-RUN STUB: validates against in-process engine; no SIWA, no HTTP, no chain.]",
            inputSchema: DRY_RUN_SUBMIT_SCORE_SCHEMA as unknown as Record<string, unknown>,
          },
        ],
      };
    },
    async callTool(req: { name: string; arguments?: Record<string, unknown> }) {
      capture.calls += 1;
      const args = (req.arguments ?? {}) as Record<string, unknown>;

      if (req.name === "get_board_state") {
        const sid = String(args.sessionId ?? "");
        if (!sid) {
          return { content: [{ type: "text", text: "sessionId required" }], isError: true };
        }
        let sess = sessions.get(sid);
        if (!sess) {
          sess = createSession(sid);
          sessions.set(sid, sess);
        }
        const payload = {
          sessionId: sid,
          board: serializeBoard(sess.board),
          score: sess.score,
          movesUsed: sess.movesUsed,
          gameOver: engineIsGameOver(sess),
        };
        return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
      }

      if (req.name === "make_move") {
        const sid = String(args.sessionId ?? "");
        const dir = args.direction as Direction;
        const sess = sessions.get(sid);
        if (!sess) {
          return {
            content: [{ type: "text", text: `Unknown sessionId "${sid}". Call get_board_state first.` }],
            isError: true,
          };
        }
        if (engineIsGameOver(sess)) {
          return {
            content: [{ type: "text", text: `Session "${sid}" is game-over.` }],
            isError: true,
          };
        }
        const before = serializeBoard(sess.board);
        const r = engineApplyMove(sess, dir);
        const after = serializeBoard(sess.board);
        capture.moves.push({
          turn: sess.movesUsed,
          direction: dir,
          boardBefore: before,
          boardAfter: after,
          scoreDelta: r.scoreDelta,
          scoreAfter: sess.score,
          moved: r.moved,
          gameOver: r.gameOver,
        });
        capture.finalScore = sess.score;
        capture.movesUsed = sess.movesUsed;
        const payload = {
          sessionId: sid,
          direction: dir,
          board: after,
          score: sess.score,
          scoreDelta: r.scoreDelta,
          moved: r.moved,
          gameOver: r.gameOver,
          movesUsed: sess.movesUsed,
        };
        return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
      }

      if (req.name === "submit_score") {
        capture.args = args;
        // Engine validation — mirror what the real submit_score does for 2048.
        const sid = String(args.sessionId ?? "");
        const moves = (args.moves as Direction[] | undefined) ?? [];
        const claimedScore = Number(args.score ?? -1);
        const live = sessions.get(sid);
        const liveScore = live ? live.score : null;
        if (liveScore !== null && liveScore !== claimedScore) {
          return {
            content: [
              {
                type: "text",
                text: `[STUB] Engine score mismatch: claimed=${claimedScore} live=${liveScore} (sessionId=${sid}, moves=${moves.length}). Submission rejected.`,
              },
            ],
            isError: true,
          };
        }
        const synthetic = {
          txHash: `0x${"dryrun".padEnd(64, "0")}`,
          soloRunId: `0x${"dryrun".padEnd(64, "a")}`,
          tier: args.tier ?? "T0",
          note: `DRY-RUN STUB (${label}): engine-validated; no SIWA, no HTTP, no chain broadcast.`,
          receivedArgs: args,
          engineValidatedScore: liveScore,
        };
        return { content: [{ type: "text", text: JSON.stringify(synthetic, null, 2) }] };
      }

      return {
        content: [{ type: "text", text: `Unknown tool "${req.name}" in dry-run stub.` }],
        isError: true,
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
  sessionId: string;
  tokenUsage: TokenUsage;
  costEstimateUsd: number;
  iterations: number;
  stoppedReason: "no_more_tool_calls" | "max_iterations" | "aborted_budget";
  finalContent: string | null;
  claimedSubmission: {
    tournamentId: string;
    game: string;
    score: number;
    tier: string;
    sessionId: string | null;
    movesCount: number;
  } | null;
  // X32-4: full move trail (visualization-ready). Populated in both
  // dry-run and broadcast paths.
  moves: MoveTrailEntry[];
  finalScore: number;
  movesUsed: number;
  toolCallCount: number;
}

function buildSessionId(label: string, tournamentId: Hex): string {
  // sessionId is the engine's seed AND the session key. Pin it to the
  // (label, tournamentId) pair so reruns of the same agent in the same
  // tournament observe the same opening board — useful for debugging.
  return `${label}:${tournamentId}`;
}

async function runAgentLegDryRun(args: {
  label: AgentBundle["label"];
  model: string;
  tournamentId: Hex;
  openrouterApiKey: string;
}): Promise<AgentLegResult> {
  const sessionId = buildSessionId(args.label, args.tournamentId);
  const capture: DryRunStubCapture = {
    args: null,
    calls: 0,
    moves: [],
    finalScore: 0,
    movesUsed: 0,
  };
  const stub = createDryRunMcpStub(args.label, sessionId, capture);
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
    // X32-4: AGENT_MAX_ITERATIONS = SOFT_MOVE_CAP + 8 — enough for one
    // get_board_state + SOFT_MOVE_CAP make_moves + submit + summary, with
    // pad for no-op slack.
    result = await client.run(AGENT_USER_PROMPT, {
      systemPrompt: AGENT_SYSTEM_PROMPT(args.label, args.tournamentId, sessionId),
      maxIterations: AGENT_MAX_ITERATIONS,
      windowTurns: AGENT_WINDOW_TURNS,
      maxTotalTokens: AGENT_MAX_TOTAL_TOKENS,
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
          game: String(capture.args["game"] ?? GAME),
          score: capture.args["score"] as number,
          tier: typeof capture.args["tier"] === "string" ? (capture.args["tier"] as string) : "T0",
          sessionId:
            typeof capture.args["sessionId"] === "string" ? (capture.args["sessionId"] as string) : null,
          movesCount: Array.isArray(capture.args["moves"]) ? (capture.args["moves"] as unknown[]).length : 0,
        }
      : null;

  return {
    label: args.label,
    model: args.model,
    sessionId,
    tokenUsage: { ...result.usage, estimatedCostUsd: costEstimateUsd },
    costEstimateUsd,
    iterations: result.iterations,
    stoppedReason: result.stoppedReason,
    finalContent: result.finalContent,
    claimedSubmission,
    moves: capture.moves,
    finalScore: capture.finalScore,
    movesUsed: capture.movesUsed,
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
  // X32-4: parsed move trail captured from the real make_move tool calls.
  // The real MCP server returns boardBefore is implicit (it's the prior
  // make_move's `board`); we reconstruct it from the previous turn.
  moves: MoveTrailEntry[];
  finalScore: number;
  movesUsed: number;
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
  // X32-4: Reconstruct boardBefore for each make_move by remembering the last
  // observed board (initially from get_board_state, then from each prior
  // make_move's `board` field).
  let lastBoardSnapshot: number[][] | null = null;
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

        // X32-4: trail capture for 2048 tools.
        const contentArr = (out as { content?: Array<{ type: string; text?: string }> }).content;
        const text =
          Array.isArray(contentArr) && contentArr[0]?.type === "text" ? contentArr[0].text ?? null : null;

        if (req.name === "get_board_state" && text) {
          try {
            const parsed = JSON.parse(text) as {
              board?: number[][];
              score?: number;
              movesUsed?: number;
            };
            if (Array.isArray(parsed.board)) lastBoardSnapshot = parsed.board;
            if (typeof parsed.score === "number") capture.finalScore = parsed.score;
            if (typeof parsed.movesUsed === "number") capture.movesUsed = parsed.movesUsed;
          } catch {
            // Tolerate non-JSON tool output; trail capture is best-effort.
          }
        }

        if (req.name === "make_move" && text) {
          try {
            const parsed = JSON.parse(text) as {
              board?: number[][];
              direction?: Direction;
              score?: number;
              scoreDelta?: number;
              moved?: boolean;
              gameOver?: boolean;
              movesUsed?: number;
            };
            const boardAfter = Array.isArray(parsed.board) ? parsed.board : [];
            const dir = (parsed.direction ?? (req.arguments?.direction as Direction)) as Direction;
            capture.moves.push({
              turn: typeof parsed.movesUsed === "number" ? parsed.movesUsed : capture.moves.length + 1,
              direction: dir,
              boardBefore: lastBoardSnapshot ?? [],
              boardAfter,
              scoreDelta: typeof parsed.scoreDelta === "number" ? parsed.scoreDelta : 0,
              scoreAfter: typeof parsed.score === "number" ? parsed.score : 0,
              moved: parsed.moved ?? false,
              gameOver: parsed.gameOver ?? false,
            });
            if (boardAfter.length > 0) lastBoardSnapshot = boardAfter;
            if (typeof parsed.score === "number") capture.finalScore = parsed.score;
            if (typeof parsed.movesUsed === "number") capture.movesUsed = parsed.movesUsed;
          } catch {
            // Same tolerance as get_board_state.
          }
        }

        if (req.name === "submit_score") {
          capture.args = req.arguments ?? {};
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

export async function runAgentLegBroadcast(args: {
  agent: AgentBundle;
  model: string;
  tournamentId: Hex;
  openrouterApiKey: string;
  publicClient: PublicClientT;
}): Promise<AgentLegBroadcastResult> {
  if (args.agent.agentId === null) {
    throw new Error(`[x32-2] ${args.agent.label}: agentId is null — register must run first`);
  }
  const sessionId = buildSessionId(args.agent.label, args.tournamentId);
  const capture: BroadcastSubmitCapture = {
    args: null,
    resultText: null,
    parsedResult: null,
    toolCalls: 0,
    errored: false,
    moves: [],
    finalScore: 0,
    movesUsed: 0,
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
    // X32-4: AGENT_MAX_ITERATIONS budget — matches dry-run leg semantics.
    result = await client.run(AGENT_USER_PROMPT, {
      systemPrompt: AGENT_SYSTEM_PROMPT(args.agent.label, args.tournamentId, sessionId),
      maxIterations: AGENT_MAX_ITERATIONS,
      windowTurns: AGENT_WINDOW_TURNS,
      maxTotalTokens: AGENT_MAX_TOTAL_TOKENS,
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
          game: String(capture.args["game"] ?? GAME),
          score: capture.args["score"] as number,
          tier: typeof capture.args["tier"] === "string" ? (capture.args["tier"] as string) : "T0",
          sessionId:
            typeof capture.args["sessionId"] === "string" ? (capture.args["sessionId"] as string) : null,
          movesCount: Array.isArray(capture.args["moves"])
            ? (capture.args["moves"] as unknown[]).length
            : 0,
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
    sessionId,
    tokenUsage: { ...result.usage, estimatedCostUsd: costEstimateUsd },
    costEstimateUsd,
    iterations: result.iterations,
    stoppedReason: result.stoppedReason,
    finalContent: result.finalContent,
    claimedSubmission,
    moves: capture.moves,
    finalScore: capture.finalScore,
    movesUsed: capture.movesUsed,
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

export async function settleTournament(
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
  sessionId: string;
  tokenUsage: TokenUsage;
  costEstimateUsd: number;
  iterations: number;
  stoppedReason: "no_more_tool_calls" | "max_iterations" | "aborted_budget";
  finalContent: string | null;
  claimedSubmission: {
    tournamentId: string;
    game: string;
    score: number;
    tier: string;
    sessionId: string | null;
    movesCount: number;
  } | null;
  moves: MoveTrailEntry[];
  finalScore: number;
  movesUsed: number;
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
  mistralAgent: AgentArtifact | null;
  deepseekAgent: AgentArtifact | null;
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
  const mistral = generateAgentBundle("mistral");
  const deepseek = generateAgentBundle("deepseek");
  const bundles: AgentBundle[] = [mistral, deepseek];
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
    console.log(`[x25] mistral leg: model=${LEG1_MODEL} (X32-4 dry-run #2: swapped from Llama 3.3 70B after two tool-use failures; see PR description for fallback chain)`);
    console.log(`[x25] deepseek leg: model=${LEG2_MODEL}`);
    console.log(`[x25] mcp transport: in-process stub (mirrors @skillos/mcp submit_score schema; no broadcast)`);

    const mistralLeg = await runAgentLegDryRun({
      label: "mistral",
      model: LEG1_MODEL,
      tournamentId,
      openrouterApiKey,
    });
    console.log(
      `[x25][mistral] iterations=${mistralLeg.iterations} stop=${mistralLeg.stoppedReason} ` +
        `tokens=${mistralLeg.tokenUsage.totalTokens} cost≈$${mistralLeg.costEstimateUsd.toFixed(6)}`,
    );
    if (mistralLeg.claimedSubmission) {
      console.log(
        `[x25][mistral] claimed score=${mistralLeg.claimedSubmission.score} (tier ${mistralLeg.claimedSubmission.tier})`,
      );
    } else {
      console.log(`[x25][mistral] no claimed submission captured (toolCalls=${mistralLeg.toolCallCount})`);
    }

    const deepseekLeg = await runAgentLegDryRun({
      label: "deepseek",
      model: LEG2_MODEL,
      tournamentId,
      openrouterApiKey,
    });
    console.log(
      `[x25][deepseek] iterations=${deepseekLeg.iterations} stop=${deepseekLeg.stoppedReason} ` +
        `tokens=${deepseekLeg.tokenUsage.totalTokens} cost≈$${deepseekLeg.costEstimateUsd.toFixed(6)}`,
    );
    if (deepseekLeg.claimedSubmission) {
      console.log(
        `[x25][deepseek] claimed score=${deepseekLeg.claimedSubmission.score} (tier ${deepseekLeg.claimedSubmission.tier})`,
      );
    } else {
      console.log(`[x25][deepseek] no claimed submission captured (toolCalls=${deepseekLeg.toolCallCount})`);
    }

    const combinedCost = mistralLeg.costEstimateUsd + deepseekLeg.costEstimateUsd;
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
        fundEth: { mistral: null, deepseek: null },
        fundUsdc: { mistral: null, deepseek: null },
        register: { mistral: null, deepseek: null },
        create: null,
        sponsor: null,
        settle: null,
      },
      settle: { sortedRanking: null, totalDistributed: null, refunded: null },
      mistralAgent: mistralLeg,
      deepseekAgent: deepseekLeg,
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
      leaderboardUrl: `https://2048.skillos.games/tournament/${tournamentId}`,
      profileUrls: Object.fromEntries(
        bundles.map((b) => [b.label, `https://2048.skillos.games/agent/${b.address}`]),
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
  console.log(`[x32-2] mistral leg: model=${LEG1_MODEL}`);
  console.log(`[x32-2] deepseek leg: model=${LEG2_MODEL}`);
  console.log(`[x32-2] mcp transport: stdio → node packages/mcp/dist/index.js (per-agent env)`);

  const mistralLeg = await runAgentLegBroadcast({
    agent: mistral,
    model: LEG1_MODEL,
    tournamentId,
    openrouterApiKey,
    publicClient,
  });
  console.log(
    `[x32-2][mistral] iterations=${mistralLeg.iterations} stop=${mistralLeg.stoppedReason} ` +
      `tokens=${mistralLeg.tokenUsage.totalTokens} cost≈$${mistralLeg.costEstimateUsd.toFixed(6)}`,
  );
  console.log(`[x32-2][mistral] submitTx=${mistralLeg.submitTxHash ?? "<none>"} confirmed=${mistralLeg.submitTxConfirmed}`);
  if (mistralLeg.claimedSubmission) {
    console.log(`[x32-2][mistral] claimed score=${mistralLeg.claimedSubmission.score} (tier ${mistralLeg.claimedSubmission.tier})`);
  }

  const deepseekLeg = await runAgentLegBroadcast({
    agent: deepseek,
    model: LEG2_MODEL,
    tournamentId,
    openrouterApiKey,
    publicClient,
  });
  console.log(
    `[x32-2][deepseek] iterations=${deepseekLeg.iterations} stop=${deepseekLeg.stoppedReason} ` +
      `tokens=${deepseekLeg.tokenUsage.totalTokens} cost≈$${deepseekLeg.costEstimateUsd.toFixed(6)}`,
  );
  console.log(`[x32-2][deepseek] submitTx=${deepseekLeg.submitTxHash ?? "<none>"} confirmed=${deepseekLeg.submitTxConfirmed}`);
  if (deepseekLeg.claimedSubmission) {
    console.log(`[x32-2][deepseek] claimed score=${deepseekLeg.claimedSubmission.score} (tier ${deepseekLeg.claimedSubmission.tier})`);
  }

  const combinedCost = mistralLeg.costEstimateUsd + deepseekLeg.costEstimateUsd;
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
      fundEth: { mistral: mistral.fundEthTxHash, deepseek: deepseek.fundEthTxHash },
      fundUsdc: { mistral: mistral.fundUsdcTxHash, deepseek: deepseek.fundUsdcTxHash },
      register: { mistral: mistral.registerTxHash, deepseek: deepseek.registerTxHash },
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
    mistralAgent: mistralLeg,
    deepseekAgent: deepseekLeg,
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
        mistral: blockscoutTxUrl(mistralLeg.submitTxHash),
        deepseek: blockscoutTxUrl(deepseekLeg.submitTxHash),
      },
      settleTx: blockscoutTxUrl(settleResult?.txHash ?? null),
      sponsorTx: blockscoutTxUrl(sponsorTxHash),
      createTx: blockscoutTxUrl(createTxHash),
    },
    leaderboardUrl: `https://2048.skillos.games/tournament/${tournamentId}`,
    profileUrls: Object.fromEntries(
      bundles.map((b) => [b.label, `https://2048.skillos.games/agent/${b.address}`]),
    ),
  };
  const out = writeArtifact(artifact);
  console.log(`\n[x32-2] artifact: ${out}`);
  console.log(`\n=== SUCCESS ===\n`);
}

// Only auto-run when invoked directly (not when imported by, e.g., the
// resume utility at scripts/x32-4-resume-broadcast.ts). `process.argv[1]`
// is the entry-point path that node was invoked with; comparing against
// `import.meta.url` distinguishes "imported as a module" from "executed
// as a script". The `endsWith` check is robust against tsx's transform-
// path remapping where argv[1] may be a different absolute path than the
// originating .ts file.
const isEntryPoint = (() => {
  try {
    const arg1 = process.argv[1] ?? "";
    return arg1.endsWith("create-hermes-vs-claude-demo.ts") || arg1.endsWith("create-hermes-vs-claude-demo.js");
  } catch {
    return false;
  }
})();
if (isEntryPoint) {
  main().catch((err) => {
    console.error("[x25] fatal:", err);
    process.exit(1);
  });
}
