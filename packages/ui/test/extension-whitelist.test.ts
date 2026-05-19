// Run with: npx tsx --test packages/ui/test/extension-whitelist.test.ts
//
// Pure-function unit tests for X14.1 evaluateExtensionProfile.
// packages/ui has no RTL setup — render-shell tests for
// ExtensionWarningModal land alongside the X14.5 regression suite when
// the test infrastructure expands. This file covers the load-bearing
// pure logic + the documented edge cases (Q-3 + Q-4 defaults).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_CONNECTORS,
  EXTENSION_PROFILE_HEADER,
  evaluateExtensionProfile,
} from "../src/extension-whitelist";

test("header constant is canonical X14.1 wire name", () => {
  assert.equal(EXTENSION_PROFILE_HEADER, "X-Extension-Profile");
});

test("ALLOWED_CONNECTORS — four canonical wallets (Q-3 founder lock)", () => {
  assert.deepEqual(
    [...ALLOWED_CONNECTORS],
    ["metamask", "coinbasewallet", "baseaccount", "rabby"],
  );
});

// ─── happy paths ─────────────────────────────────────────────────────────

test("MetaMask + human-only → allowed, enforced", () => {
  const p = evaluateExtensionProfile("metaMask", "human-only");
  assert.equal(p.detected, "metamask");
  assert.equal(p.allowed, true);
  assert.equal(p.enforced, true);
});

test("Coinbase Wallet + human-only → allowed, enforced (case + space normalize)", () => {
  const p = evaluateExtensionProfile("Coinbase Wallet", "human-only");
  assert.equal(p.detected, "coinbasewallet");
  assert.equal(p.allowed, true);
  assert.equal(p.enforced, true);
});

test("Base Account + human-only → allowed, enforced", () => {
  const p = evaluateExtensionProfile("baseAccount", "human-only");
  assert.equal(p.detected, "baseaccount");
  assert.equal(p.allowed, true);
  assert.equal(p.enforced, true);
});

test("Rabby + human-only → allowed, enforced", () => {
  const p = evaluateExtensionProfile("rabby", "human-only");
  assert.equal(p.detected, "rabby");
  assert.equal(p.allowed, true);
  assert.equal(p.enforced, true);
});

// ─── soft-warning trigger conditions (Q-4 default) ──────────────────────

test("WalletConnect + human-only → NOT allowed, enforced (modal fires)", () => {
  const p = evaluateExtensionProfile("walletConnect", "human-only");
  assert.equal(p.detected, "walletconnect");
  assert.equal(p.allowed, false);
  assert.equal(p.enforced, true);
});

test("unknown injected wallet + human-only → NOT allowed, enforced", () => {
  const p = evaluateExtensionProfile("trustWallet", "human-only");
  assert.equal(p.detected, "trustwallet");
  assert.equal(p.allowed, false);
  assert.equal(p.enforced, true);
});

// ─── class scope (Q-6 default — agent-only + mixed-declared inert) ──────

test("non-whitelist connector + agent-only → enforced=false (no warning)", () => {
  const p = evaluateExtensionProfile("walletConnect", "agent-only");
  assert.equal(p.detected, "walletconnect");
  assert.equal(p.allowed, false);
  assert.equal(p.enforced, false);
});

test("non-whitelist connector + mixed-declared → enforced=false (no warning)", () => {
  const p = evaluateExtensionProfile("walletConnect", "mixed-declared");
  assert.equal(p.detected, "walletconnect");
  assert.equal(p.allowed, false);
  assert.equal(p.enforced, false);
});

test("MetaMask + mixed-declared → enforced=false (modal stays inert on happy path too)", () => {
  const p = evaluateExtensionProfile("metaMask", "mixed-declared");
  assert.equal(p.allowed, true);
  assert.equal(p.enforced, false);
});

// ─── edges (null, undefined, empty, whitespace-only) ────────────────────

test("null connector + human-only → detected=null, NOT allowed, enforced", () => {
  const p = evaluateExtensionProfile(null, "human-only");
  assert.equal(p.detected, null);
  assert.equal(p.allowed, false);
  assert.equal(p.enforced, true);
});

test("undefined connector + human-only → detected=null, NOT allowed, enforced", () => {
  const p = evaluateExtensionProfile(undefined, "human-only");
  assert.equal(p.detected, null);
  assert.equal(p.allowed, false);
  assert.equal(p.enforced, true);
});

test("empty string connector + human-only → detected=null", () => {
  const p = evaluateExtensionProfile("", "human-only");
  assert.equal(p.detected, null);
  assert.equal(p.allowed, false);
});

test("whitespace-only connector + human-only → detected=null after normalize", () => {
  const p = evaluateExtensionProfile("   ", "human-only");
  assert.equal(p.detected, null);
  assert.equal(p.allowed, false);
});

// ─── case-normalization (all variants collapse to same detected) ────────

test("case variants all normalize identically", () => {
  const variants = ["MetaMask", "metaMask", "metamask", "META MASK", "  MetaMask  "];
  for (const v of variants) {
    const p = evaluateExtensionProfile(v, "human-only");
    assert.equal(p.detected, "metamask", `variant "${v}" should normalize to "metamask"`);
    assert.equal(p.allowed, true);
  }
});
