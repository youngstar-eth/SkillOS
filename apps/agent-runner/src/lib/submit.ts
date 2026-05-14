import { signSIWAMessage } from '@buildersgarden/siwa/siwa';
import { signAuthenticatedRequest } from '@buildersgarden/siwa/erc8128';
import type { PrivateKeyAccount } from 'viem/accounts';
import type { Game } from './wallet.js';
import type { ScoringResult } from '../scoring/index.js';

const CHAIN_ID = 84532;
const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const AGENT_REGISTRY_CAIP10 = `eip155:${CHAIN_ID}:${REGISTRY}` as const;
const DEFAULT_BASE_URL = 'https://api.skillos.network';
const DEFAULT_SIWA_DOMAIN = 'skillos.network';

export interface SubmitInput {
  game: Game;
  account: PrivateKeyAccount;
  agentId: number;
  tournamentId: string;
  scoring: ScoringResult;
  mode: 'dry-run' | 'live';
}

interface DryRunOutput {
  mode: 'dry-run';
  path: 'free';
  agent: `0x${string}`;
  agentId: number;
  game: Game;
  tournament: string;
  score: number;
  siwaReceipt: 'valid';
  signedRequestHeaders: Record<string, string>;
  wouldPostTo: string;
  requestBody: SubmitRequestBody;
}

interface LiveOutput {
  mode: 'live';
  agent: `0x${string}`;
  agentId: number;
  game: Game;
  tournament: string;
  score: number;
  status: number;
  txHash?: string;
  chainRevertCode?: string;
  response: unknown;
}

interface SubmitRequestBody {
  tournamentId: string;
  game: Game;
  score: number;
  matchCountDelta: number;
  tier: 'T0';
}

// Inline TransactionSigner — matches @buildersgarden/siwa's 4-method shape
// without importing the /signer subpath (memory: barrel-trap pulls circle.js
// → ERR_MODULE_NOT_FOUND on @circle-fin/...). Mirrors agent-smoke.mjs:46-62.
function buildSigner(account: PrivateKeyAccount) {
  return {
    async getAddress() {
      return account.address;
    },
    async signMessage(message: string) {
      return account.signMessage({ message });
    },
    async signRawMessage(rawHex: `0x${string}`) {
      return account.signMessage({ message: { raw: rawHex } });
    },
    async signTransaction(tx: Parameters<typeof account.signTransaction>[0]) {
      return account.signTransaction(tx);
    },
  };
}

async function siwaAuthenticate(
  baseUrl: string,
  domain: string,
  account: PrivateKeyAccount,
  agentId: number,
): Promise<{ receipt: string; address: string; builderCode?: string }> {
  // Step 1: nonce
  const nonceRes = await fetch(`${baseUrl}/v1/auth/siwa/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!nonceRes.ok) {
    throw new Error(`SIWA nonce failed: HTTP ${nonceRes.status}: ${await nonceRes.text()}`);
  }
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  // Step 2: sign SIWA message
  const signer = buildSigner(account);
  const { message, signature } = await signSIWAMessage(
    {
      domain,
      uri: `https://${domain}/v1/auth/siwa`,
      agentId,
      agentRegistry: AGENT_REGISTRY_CAIP10,
      chainId: CHAIN_ID,
      nonce,
      issuedAt: new Date().toISOString(),
    },
    signer as never,
  );

  // Step 3: verify → receipt + builderCode
  const verifyRes = await fetch(`${baseUrl}/v1/auth/siwa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  if (!verifyRes.ok) {
    throw new Error(`SIWA verify failed: HTTP ${verifyRes.status}: ${await verifyRes.text()}`);
  }
  return (await verifyRes.json()) as { receipt: string; address: string; builderCode?: string };
}

function snapshotHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    out[key] = value.length > 80 ? `${value.slice(0, 76)}…` : value;
  });
  return out;
}

export async function submit(input: SubmitInput): Promise<DryRunOutput | LiveOutput> {
  const baseUrl = (process.env.SKILLOS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const domain = process.env.SIWA_DOMAIN ?? DEFAULT_SIWA_DOMAIN;

  const verify = await siwaAuthenticate(baseUrl, domain, input.account, input.agentId);

  // Drift 3: request body — { tournamentId, game, score, matchCountDelta, tier }.
  // No agentId (server resolves from SIWA receipt → wallet address → registry).
  // No metadata (T0 tier doesn't accept it in request body).
  // X10: `game` added so the API can resolve the per-game Builder Code for
  // ERC-8021 dataSuffix attribution. Required field — without it the server
  // rejects with 400 (mis-attribution would lose Path A revenue share).
  const requestBody: SubmitRequestBody = {
    tournamentId: input.tournamentId,
    game: input.game,
    score: input.scoring.score,
    matchCountDelta: 1,
    tier: 'T0',
  };
  const submitUrl = `${baseUrl}/v1/agents/scores`;
  const baseRequest = new Request(submitUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  // Drift 2: use signAuthenticatedRequest helper, not manual headers.
  // The helper computes the ERC-8128 per-action signature and sets the
  // canonical headers (lib-internal names per ERC-8128 spec). Mirrors
  // agent-smoke.mjs:130-135.
  const signer = buildSigner(input.account);
  const signedRequest = await signAuthenticatedRequest(
    baseRequest,
    verify.receipt,
    signer as never,
    CHAIN_ID,
  );

  if (input.mode === 'dry-run') {
    return {
      mode: 'dry-run',
      path: 'free',
      agent: input.account.address,
      agentId: input.agentId,
      game: input.game,
      tournament: input.tournamentId,
      score: input.scoring.score,
      siwaReceipt: 'valid',
      signedRequestHeaders: snapshotHeaders(signedRequest),
      wouldPostTo: submitUrl,
      requestBody,
    };
  }

  // Live: POST. Per agent-smoke.mjs convention, 409 CHAIN_REVERT_* is treated
  // as pipeline-success (auth + sign + broadcast all ran; chain rejected
  // tournament state) — cron-friendly distinction from "system broken".
  const res = await fetch(signedRequest);
  const status = res.status;

  if (status === 200) {
    const data = (await res.json()) as { txHash: string; [k: string]: unknown };
    return {
      mode: 'live',
      agent: input.account.address,
      agentId: input.agentId,
      game: input.game,
      tournament: input.tournamentId,
      score: input.scoring.score,
      status,
      txHash: data.txHash,
      response: data,
    };
  }

  if (status === 409) {
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: { code?: string };
    };
    const code = errBody.error?.code;
    if (typeof code === 'string' && code.startsWith('CHAIN_REVERT_')) {
      return {
        mode: 'live',
        agent: input.account.address,
        agentId: input.agentId,
        game: input.game,
        tournament: input.tournamentId,
        score: input.scoring.score,
        status,
        chainRevertCode: code,
        response: errBody,
      };
    }
    throw new Error(`Submit 409 ${code ?? '<no-code>'}: ${JSON.stringify(errBody)}`);
  }

  throw new Error(`Submit failed: HTTP ${status}: ${await res.text()}`);
}
