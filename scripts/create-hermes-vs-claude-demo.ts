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
//   Broadcast (after dry-run output reviewed):
//     /usr/local/bin/node --env-file=apps/2048/.env.local \
//       ./node_modules/.bin/tsx scripts/create-hermes-vs-claude-demo.ts --broadcast
//
//   Custom tournament window (default 60 min):
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
const SEED_PRIZE_USDC = 1_000_000n;       // 1 USDC: minimum to bypass ZeroPrize
const SPONSOR_TOPUP_USDC = 49_000_000n;   // 49 USDC: brings total to 50 USDC
const TOTAL_PRIZE_USDC = SEED_PRIZE_USDC + SPONSOR_TOPUP_USDC;

// Per-agent funding
const AGENT_GAS_ETH = 5_000_000_000_000_000n;  // 0.005 ETH
const AGENT_USDC = 5_000_000n;                 // 5 USDC (any future retry buffer)

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
  const onChainOwner = (await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "ownerOf",
    args: [agentId],
  })) as Address;
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
  return hash;
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

  const txHash = await deployer.writeContract({
    address: SPONSORSHIP_MODULE_ADDRESS,
    abi: SPONSORSHIP_MODULE_ABI,
    functionName: "sponsorPool",
    args: [tournamentId, SPONSOR_TOPUP_USDC],
    account: deployer.account,
    chain: baseSepolia,
  });
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
// X32 update (replaces the original X25 PSEUDOCODE skeleton):
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
  leaderboardUrl: string;
  profileUrls: Record<string, string>;
}

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

  // Step 2: fund each agent (ETH + USDC).
  for (const b of bundles) {
    b.fundEthTxHash = await fundAgentEth(deployer, publicClient, b);
    console.log(`[x25][${b.label}] fundEth tx: ${b.fundEthTxHash}`);
    b.fundUsdcTxHash = await fundAgentUsdc(deployer, publicClient, b);
    console.log(`[x25][${b.label}] fundUsdc tx: ${b.fundUsdcTxHash}`);
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

  // Step 6: submission — deferred to agent runtimes (skeleton only).
  console.log(`\n[x25] === Bootstrap complete. Agent submissions run during the next ${DURATION_MIN}min window. ===`);
  console.log(`[x25] Re-invoke with --settle-only=${tournamentId} after window close to settle.\n`);

  // NOTE: The settle step is deliberately NOT broadcast in this same invocation —
  // the tournament window has not yet elapsed. Settle is the founder's second
  // invocation (or a follow-up cron sweep). For the climax demo, settle is run
  // after both agents have submitted.
  let settleResult: { txHash: Hex; sortedRanking: Address[]; totalDistributed: bigint; refunded: bigint } | null = null;
  const settleNowArg = process.argv.includes("--settle-now");
  if (settleNowArg) {
    console.log(`[x25] --settle-now flag present: waiting until endsAt and broadcasting settle.`);
    const waitMs = Math.max(0, endsAt * 1000 - Date.now()) + 5_000;
    if (waitMs > 0) {
      console.log(`[x25] sleeping ${Math.round(waitMs / 1000)}s until past endsAt...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
    settleResult = await settleTournament(deployer, publicClient, tournamentId);
    console.log(`[x25] settle tx: ${settleResult.txHash}`);
    console.log(`[x25] totalDistributed=${formatUnits(settleResult.totalDistributed, 6)} USDC, refunded=${formatUnits(settleResult.refunded, 6)} USDC`);
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
    // Broadcast-path wrapper wiring deferred to next sprint per X32 constraint
    // (no `--broadcast` in this sprint — on-chain run gated for founder review).
    hermesAgent: null,
    claudeAgent: null,
    basescanUrls: {
      tournament: `https://sepolia.basescan.org/address/${TOURNAMENT_POOL_V2_ADDRESS}`,
      sponsorshipModule: `https://sepolia.basescan.org/address/${SPONSORSHIP_MODULE_ADDRESS}`,
      sponsorReceiptSbt: `https://sepolia.basescan.org/address/${SPONSOR_RECEIPT_SBT_ADDRESS}`,
      identityRegistry: `https://sepolia.basescan.org/address/${IDENTITY_REGISTRY_ADDRESS}`,
    },
    leaderboardUrl: `https://match3.skillos.games/tournament/${tournamentId}`,
    profileUrls: Object.fromEntries(
      bundles.map((b) => [b.label, `https://match3.skillos.games/agent/${b.address}`]),
    ),
  };
  const out = writeArtifact(artifact);
  console.log(`\n[x25] artifact: ${out}`);
  console.log(`\n=== SUCCESS ===\n`);
}

main().catch((err) => {
  console.error("[x25] fatal:", err);
  process.exit(1);
});
