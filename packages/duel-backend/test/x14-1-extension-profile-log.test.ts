// Run with: npx tsx --test packages/duel-backend/test/x14-1-extension-profile-log.test.ts
//
// X14.1 — server audit log emitter unit tests.
//
// Tests the `logExtensionProfile` helper from @skillos/lib-shared
// directly (load-bearing for the structured log fingerprint downstream
// tooling pulls via the `event: "x14_1_extension_profile"`
// discriminator — see memory `reference_vercel_log_substring_oracle`).
//
// The route-handler integration (header read at solo.ts after class
// gate) is exercised by manual smoke + the X14.5 regression suite when
// it lands. Phase 1 advisory scope keeps the surface small enough that
// pure-helper coverage is sufficient.

import { test } from "node:test";
import assert from "node:assert/strict";
import { logExtensionProfile } from "@skillos/lib-shared";

function captureWarn(fn: () => void): string[] {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (msg: unknown) => {
    lines.push(typeof msg === "string" ? msg : JSON.stringify(msg));
  };
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return lines;
}

test("logExtensionProfile — emits single JSON line on stderr (console.warn)", () => {
  const lines = captureWarn(() => {
    logExtensionProfile({
      tournament_id: "00000000-0000-0000-0000-000000000001",
      tournament_class: "human-only",
      player_address: "0xcafe000000000000000000000000000000000000",
      detected_connector: "walletconnect",
      allowed: false,
    });
  });
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(parsed.event, "x14_1_extension_profile");
  assert.equal(parsed.tournament_id, "00000000-0000-0000-0000-000000000001");
  assert.equal(parsed.tournament_class, "human-only");
  assert.equal(
    parsed.player_address,
    "0xcafe000000000000000000000000000000000000",
  );
  assert.equal(parsed.detected_connector, "walletconnect");
  assert.equal(parsed.allowed, false);
  assert.equal(typeof parsed.ts, "string");
  // ISO-8601 sanity: parseable + non-NaN epoch.
  assert.equal(Number.isFinite(new Date(parsed.ts as string).getTime()), true);
});

test("logExtensionProfile — allowed=true happy-path also logged (baseline signal)", () => {
  const lines = captureWarn(() => {
    logExtensionProfile({
      tournament_id: "00000000-0000-0000-0000-000000000002",
      tournament_class: "human-only",
      player_address: "0xbeef000000000000000000000000000000000000",
      detected_connector: "metamask",
      allowed: true,
    });
  });
  const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(parsed.allowed, true);
  assert.equal(parsed.detected_connector, "metamask");
});

test("logExtensionProfile — detected_connector=null when header was empty", () => {
  const lines = captureWarn(() => {
    logExtensionProfile({
      tournament_id: "00000000-0000-0000-0000-000000000003",
      tournament_class: "human-only",
      player_address: "0xdead000000000000000000000000000000000000",
      detected_connector: null,
      allowed: false,
    });
  });
  const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(parsed.detected_connector, null);
});

test("logExtensionProfile — single substring oracle fingerprint per line", () => {
  // The downstream `vercel logs --no-branch --json | grep
  // x14_1_extension_profile` flow relies on the event name appearing
  // exactly once in the line. Guards against accidental log
  // expansion that would inflate substring matches.
  const lines = captureWarn(() => {
    logExtensionProfile({
      tournament_id: "00000000-0000-0000-0000-000000000004",
      tournament_class: "agent-only",
      player_address: "0xfeed000000000000000000000000000000000000",
      detected_connector: "metamask",
      allowed: true,
    });
  });
  const occurrences = lines[0].split("x14_1_extension_profile").length - 1;
  assert.equal(occurrences, 1);
});
