#!/usr/bin/env node
// scripts/agent-smoke.mjs — X4 visual smoke (PR #67 step 3-5).
//
// Bypasses @skillos/sdk because the SDK has the same @buildersgarden/siwa
// barrel-cascade trap that apps/api hit (see reference_buildersgarden_siwa_barrel_trap.md).
// SDK fix is a separate follow-up; this smoke uses the library's clean
// subpaths directly + an inline TransactionSigner (4-method shape lifted
// from @buildersgarden/siwa/dist/signer/local-account.js).
//
// Env:
//   REGISTER_AGENT_PRIVATE_KEY  — 0x-prefixed 32-byte hex (the agent wallet)
//   AGENT_ID                    — positive integer from register-agent.ts
//   TOURNAMENT_ID               — bytes32 hex from GET /v1/tournaments
//   SKILLOS_BASE_URL            — optional, defaults to https://api.skillos.network
//
// Run from monorepo root:
//   node scripts/agent-smoke.mjs

import { signSIWAMessage } from '@buildersgarden/siwa/siwa';
import { signAuthenticatedRequest } from '@buildersgarden/siwa/erc8128';
import { privateKeyToAccount } from 'viem/accounts';

const pk = process.env.REGISTER_AGENT_PRIVATE_KEY ?? '';
if (!/^0x[a-fA-F0-9]{64}$/.test(pk)) {
  console.error('REGISTER_AGENT_PRIVATE_KEY must be 0x-prefixed 32-byte hex');
  process.exit(1);
}
const agentId = Number((process.env.AGENT_ID ?? '').trim().replace(/n$/, ''));
if (!Number.isFinite(agentId) || agentId <= 0) {
  console.error('AGENT_ID env required (positive integer from register-agent.ts output)');
  process.exit(1);
}
const tournamentId = (process.env.TOURNAMENT_ID ?? '').toLowerCase();
if (!/^0x[a-f0-9]{64}$/.test(tournamentId)) {
  console.error('TOURNAMENT_ID env required (bytes32 hex)');
  process.exit(1);
}
const baseUrl = (process.env.SKILLOS_BASE_URL ?? 'https://api.skillos.network').replace(/\/$/, '');

const CHAIN_ID = 84532;
const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const AGENT_REGISTRY_CAIP10 = `eip155:${CHAIN_ID}:${REGISTRY}`;
const DOMAIN = process.env.SIWA_DOMAIN ?? 'skillos.network';

const account = privateKeyToAccount(pk);
// Inline TransactionSigner — matches @buildersgarden/siwa's signer interface
// without touching the /signer subpath (which eagerly loads signer/circle.js
// and crashes when @circle-fin/developer-controlled-wallets isn't installed).
const signer = {
  async getAddress() {
    return account.address;
  },
  async signMessage(message) {
    return account.signMessage({ message });
  },
  async signRawMessage(rawHex) {
    return account.signMessage({ message: { raw: rawHex } });
  },
  async signTransaction(tx) {
    return account.signTransaction(tx);
  },
};

console.log(`Agent wallet: ${account.address}`);
console.log(`Agent ID:     ${agentId}`);
console.log(`Tournament:   ${tournamentId}`);
console.log(`API:          ${baseUrl}`);
console.log('');

// ─── Step 1: SIWA nonce ────────────────────────────────────────────────────
console.log('1. POST /v1/auth/siwa/nonce');
const nonceRes = await fetch(`${baseUrl}/v1/auth/siwa/nonce`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
if (!nonceRes.ok) {
  console.error(`   FAIL ${nonceRes.status}: ${await nonceRes.text()}`);
  process.exit(2);
}
const { nonce } = await nonceRes.json();
console.log(`   OK   nonce=${nonce}`);

// ─── Step 2: sign SIWA message ─────────────────────────────────────────────
console.log('2. signSIWAMessage(...)');
const { message, signature } = await signSIWAMessage(
  {
    domain: DOMAIN,
    uri: `https://${DOMAIN}/v1/auth/siwa`,
    agentId,
    agentRegistry: AGENT_REGISTRY_CAIP10,
    chainId: CHAIN_ID,
    nonce,
    issuedAt: new Date().toISOString(),
  },
  signer,
);
console.log(`   OK   signature=${signature.slice(0, 20)}... (${signature.length} chars)`);

// ─── Step 3: SIWA verify → receipt + builderCode ───────────────────────────
console.log('3. POST /v1/auth/siwa/verify');
const verifyRes = await fetch(`${baseUrl}/v1/auth/siwa/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, signature }),
});
if (!verifyRes.ok) {
  console.error(`   FAIL ${verifyRes.status}: ${await verifyRes.text()}`);
  process.exit(2);
}
const verifyBody = await verifyRes.json();
console.log(`   OK   receipt=${verifyBody.receipt.slice(0, 32)}... (${verifyBody.receipt.length} chars)`);
console.log(`   OK   verified address=${verifyBody.address}`);
console.log(`   OK   builderCode=${verifyBody.builderCode ?? '(none — api.base.dev fetch failed or wallet has no code)'}`);

// ─── Step 4: ERC-8128-signed agent score submission ────────────────────────
console.log('4. POST /v1/agents/scores (ERC-8128 signed)');
const submitUrl = `${baseUrl}/v1/agents/scores`;
const submitBody = JSON.stringify({
  tournamentId,
  score: 1024,
  matchCountDelta: 1,
  tier: 'T0',
});
const baseRequest = new Request(submitUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: submitBody,
});
const signedRequest = await signAuthenticatedRequest(
  baseRequest,
  verifyBody.receipt,
  signer,
  CHAIN_ID,
);
const submitRes = await fetch(signedRequest);

// ─── Step 5: classify outcome ──────────────────────────────────────────────
console.log('5. classify outcome');
if (submitRes.status === 200) {
  const data = await submitRes.json();
  const txHashOk = typeof data.txHash === 'string' && /^0x[a-f0-9]{64}$/i.test(data.txHash);
  const playerOk = data.agentAddress?.toLowerCase() === account.address.toLowerCase();
  console.log(`   OK   200 + txHash=${data.txHash}`);
  console.log(`   ${txHashOk ? 'OK' : 'FAIL'}   txHash shape valid`);
  console.log(`   ${playerOk ? 'OK' : 'FAIL'}   player arg = AGENT_ADDR (${data.agentAddress})`);
  console.log(`   OK   tier=${data.tier}`);
  console.log('');
  console.log(`BaseScan: https://sepolia.basescan.org/tx/${data.txHash}`);
  if (!txHashOk || !playerOk) process.exit(1);
} else if (submitRes.status === 409) {
  const err = await submitRes.json().catch(() => ({}));
  const code = err?.error?.code ?? '<no-code>';
  if (typeof code === 'string' && code.startsWith('CHAIN_REVERT_')) {
    console.log(`   OK   409 ${code} — E2E pipeline verified (auth + ERC-8128 + tx broadcast all executed; chain rejected the tournament state — pick a fresher tournament or accept smoke-pass per smoke-x2.ts convention)`);
  } else {
    console.error(`   FAIL 409 ${code}: ${JSON.stringify(err)}`);
    process.exit(1);
  }
} else {
  const txt = await submitRes.text();
  console.error(`   FAIL ${submitRes.status}: ${txt}`);
  process.exit(1);
}

console.log('');
console.log('SMOKE COMPLETE — X4 SIWA + agent score submit verified end-to-end.');
