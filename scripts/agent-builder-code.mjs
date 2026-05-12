#!/usr/bin/env node
// scripts/agent-builder-code.mjs — SIWA-only builder code derivation.
//
// Variant of agent-smoke.mjs (Sprint X4) restricted to Steps 1-3:
// nonce → sign → verify. Steps 4-5 (ERC-8128 score signing + on-chain
// submitSoloScore) are intentionally dropped so this script is safe to run
// for builder-code derivation without any tournament-state mutation. Use
// agent-smoke.mjs when you actually need the end-to-end smoke.
//
// Bypasses @skillos/sdk because the SDK has the @buildersgarden/siwa
// barrel-cascade trap that apps/api hit (see reference_buildersgarden_siwa_barrel_trap.md).
// Uses the lib's clean /siwa subpath + an inline TransactionSigner (4-method
// shape lifted from @buildersgarden/siwa/dist/signer/local-account.js).
// Do NOT swap the inline signer for the library default — the /signer subpath
// eagerly loads signer/circle.js and crashes when @circle-fin/developer-
// controlled-wallets isn't installed.
//
// Env:
//   REGISTER_AGENT_PRIVATE_KEY  — 0x-prefixed 32-byte hex (the agent wallet)
//   AGENT_ID                    — positive integer from register-agent.ts
//   SKILLOS_BASE_URL            — optional, defaults to https://api.skillos.network
//   SIWA_DOMAIN                 — optional, defaults to skillos.network
//
// Output (parseable):
//   BUILDER_CODE=bc_xxxxxxxx     — emitted on its own line at end on success
//
// Exit codes:
//   0  — success, builderCode emitted
//   1  — bad env input
//   2  — SIWA API failed or verify returned no builderCode

import { signSIWAMessage } from '@buildersgarden/siwa/siwa';
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
const baseUrl = (process.env.SKILLOS_BASE_URL ?? 'https://api.skillos.network').replace(/\/$/, '');

const CHAIN_ID = 84532;
const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const AGENT_REGISTRY_CAIP10 = `eip155:${CHAIN_ID}:${REGISTRY}`;
const DOMAIN = process.env.SIWA_DOMAIN ?? 'skillos.network';

const account = privateKeyToAccount(pk);
// Inline TransactionSigner — matches @buildersgarden/siwa's signer interface
// without touching the /signer subpath (barrel-trap memory).
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

if (!verifyBody.builderCode || typeof verifyBody.builderCode !== 'string') {
  console.error('   FAIL no builderCode in verify response — api.base.dev fetch failed upstream or wallet has no code');
  process.exit(2);
}
console.log(`   OK   builderCode=${verifyBody.builderCode}`);
console.log('');
console.log(`BUILDER_CODE=${verifyBody.builderCode}`);
