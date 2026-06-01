// Process-local delegation state for the prepare_*/complete_* tool pairs.
//
// Same lifetime model as engines/session_store.ts: state lives in the
// @skillos/mcp server process. The X32-* demo pattern spawns one stdio
// subprocess per agent, so prepare_* and its matching complete_* run in the
// same process. Cross-process persistence is out of scope (v0.1).
//
// Three maps:
//   - siwaPending: the SIWA message awaiting a host signature (keyed by W).
//   - receipts:    the verified SIWA receipt cached after complete_siwa
//                  (keyed by W) and read by prepare_submit.
//   - submitPending: the assembled-but-unsigned ERC-8128 request awaiting a
//                  host signature (keyed by an opaque prepareId).

import { randomUUID } from 'node:crypto';
import type { PendingSignedRequest } from './erc8128.js';

export interface SiwaPending {
  message: string;
  nonce: string;
  issuedAt: string;
}

export interface CachedReceipt {
  receipt: string;
  expiresAt: string;
  agentId: number;
}

const siwaPending = new Map<string, SiwaPending>();
const receipts = new Map<string, CachedReceipt>();
const submitPending = new Map<string, PendingSignedRequest>();

const key = (address: string): string => address.toLowerCase();

// ─── SIWA pending (between prepare_siwa and complete_siwa) ───────────────
export function putSiwaPending(address: string, pending: SiwaPending): void {
  siwaPending.set(key(address), pending);
}
export function getSiwaPending(address: string): SiwaPending | undefined {
  return siwaPending.get(key(address));
}

// ─── SIWA receipt (between complete_siwa and prepare_submit) ─────────────
export function putReceipt(address: string, receipt: CachedReceipt): void {
  receipts.set(key(address), receipt);
}
export function getReceipt(address: string): CachedReceipt | undefined {
  const r = receipts.get(key(address));
  if (r && new Date(r.expiresAt).getTime() <= Date.now()) {
    receipts.delete(key(address));
    return undefined;
  }
  return r;
}

// ─── Submit pending (between prepare_submit and complete_submit) ─────────
export function putSubmitPending(pending: PendingSignedRequest): string {
  const prepareId = randomUUID();
  submitPending.set(prepareId, pending);
  return prepareId;
}
export function takeSubmitPending(prepareId: string): PendingSignedRequest | undefined {
  const p = submitPending.get(prepareId);
  if (p) submitPending.delete(prepareId);
  return p;
}

/** Test-only — clear all delegation state. Not exported through the package surface. */
export function _clearAllForTests(): void {
  siwaPending.clear();
  receipts.clear();
  submitPending.clear();
}
