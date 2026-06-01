// SPEC-B1 offline harness — proves the base-mcp wallet-delegation signing
// scheme aligns with what the SkillOS (@buildersgarden/siwa) VERIFIER accepts.
//
// The single highest-risk claim in SPEC-B1 is the "signing-scheme verification
// gate": that a base-mcp `sign(type=personal_sign, {message})` — which EIP-191
// wraps the UTF-8 bytes of the supplied string — produces a signature the
// unchanged SkillOS verifier accepts, for BOTH the SIWA message and the
// ERC-8128 per-request signature base.
//
// base-mcp is not available offline, so we simulate it EXACTLY: a viem EOA at
// address W signing via `account.signMessage({ message })` is byte-for-byte
// what base-mcp personal_sign does (EIP-191 personal_sign over the UTF-8 of the
// string). We then run the prepared payloads through the REAL verifier paths:
//   - SIWA:     viem `verifyMessage` (the exact call siwa.verifySIWA makes).
//   - ERC-8128: `verifyAuthenticatedRequest` (the exact server-side entry the
//               API's agent-auth middleware uses), with an offline-minted HMAC
//               receipt and `verifyOnchain: false` (no chain in the harness).
//
// If these pass, the EIP-191 alignment holds and live base-mcp wiring is GO.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';
import { createReceipt } from '@buildersgarden/siwa/receipt';
import { verifyAuthenticatedRequest } from '@buildersgarden/siwa/erc8128';
import { buildAgentSiwaMessage } from '../src/delegation/siwa.js';
import { prepareSignedRequest, assembleSignedRequest } from '../src/delegation/erc8128.js';

// Anvil test account #1 — deterministic, never funded with anything real.
const TEST_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const W = privateKeyToAccount(TEST_PK);
const CHAIN_ID = 84532;
const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const AGENT_REGISTRY = `eip155:${CHAIN_ID}:${REGISTRY}`;

/**
 * Simulate base-mcp `sign(type=personal_sign, data={ message })` EXACTLY:
 * personal_sign EIP-191-wraps the UTF-8 bytes of the message string. A viem
 * EOA `signMessage({ message })` is the identical operation.
 */
async function baseMcpPersonalSign(message: string): Promise<`0x${string}`> {
  return W.signMessage({ message });
}

test('SIWA: base-mcp personal_sign over prepare_siwa message verifies as W (EIP-191 alignment)', async () => {
  const message = buildAgentSiwaMessage({
    domain: 'skillos.network',
    address: W.address,
    agentId: 5764,
    agentRegistry: AGENT_REGISTRY,
    chainId: CHAIN_ID,
    nonce: 'testnonce1234567',
    issuedAt: '2026-06-01T00:00:00.000Z',
  });

  const signature = await baseMcpPersonalSign(message);

  // The exact signature check siwa.verifySIWA performs (sans onchain ownerOf).
  const ok = await verifyMessage({ address: W.address, message, signature });
  assert.equal(ok, true, 'SIWA message signature must recover to W under EIP-191');
});

test('ERC-8128: base-mcp personal_sign over prepare_submit base is ACCEPTED by the verifier', async () => {
  const secret = 'harness-receipt-secret-not-production';
  const { receipt } = createReceipt(
    {
      address: W.address,
      agentId: 5764,
      agentRegistry: AGENT_REGISTRY,
      chainId: CHAIN_ID,
      signerType: 'eoa',
    },
    { secret },
  );

  const bodyText = JSON.stringify({
    tournamentId: `0x${'ab'.repeat(32)}`,
    game: '2048',
    score: 1024,
    matchCountDelta: 1,
    tier: 'T0',
  });

  // prepare: skillos constructs the ERC-8128 signature base — signs nothing.
  const { message, pending } = await prepareSignedRequest({
    address: W.address,
    chainId: CHAIN_ID,
    receipt,
    url: 'https://api.skillos.network/v1/agents/scores',
    method: 'POST',
    bodyText,
    contentType: 'application/json',
  });

  // The signature base is the printable-ASCII RFC-9421 base; a base-mcp
  // personal_sign over the STRING form must match the verifier's raw-bytes view.
  const signature = await baseMcpPersonalSign(message);

  // complete: skillos assembles the signed Request (injects the signature).
  const finalReq = assembleSignedRequest(pending, signature);

  const result = await verifyAuthenticatedRequest(finalReq, {
    receiptSecret: secret,
    verifyOnchain: false,
  });

  assert.equal(result.valid, true, `verifier must accept the delegated signature: ${JSON.stringify(result)}`);
  assert.equal(result.agent?.address.toLowerCase(), W.address.toLowerCase());
});

test('ERC-8128: a signature over the WRONG bytes (hex of the base, not the base) is REJECTED', async () => {
  // Guards against the X32-2 regression: signing the UTF-8 of the hex string
  // instead of the base bytes must NOT verify.
  const secret = 'harness-receipt-secret-not-production';
  const { receipt } = createReceipt(
    { address: W.address, agentId: 5764, agentRegistry: AGENT_REGISTRY, chainId: CHAIN_ID, signerType: 'eoa' },
    { secret },
  );
  const bodyText = JSON.stringify({ tournamentId: `0x${'cd'.repeat(32)}`, game: '2048', score: 16, tier: 'T0' });
  const { message, pending } = await prepareSignedRequest({
    address: W.address,
    chainId: CHAIN_ID,
    receipt,
    url: 'https://api.skillos.network/v1/agents/scores',
    method: 'POST',
    bodyText,
    contentType: 'application/json',
  });

  // WRONG: sign the hex encoding of the base bytes (the X32-2 failure mode).
  const wrongInput = `0x${Buffer.from(message, 'utf8').toString('hex')}`;
  const wrongSig = await baseMcpPersonalSign(wrongInput);
  const finalReq = assembleSignedRequest(pending, wrongSig);

  const result = await verifyAuthenticatedRequest(finalReq, { receiptSecret: secret, verifyOnchain: false });
  assert.equal(result.valid, false, 'a signature over the wrong bytes must be rejected');
});
