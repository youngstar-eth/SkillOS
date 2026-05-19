// Run with: npx tsx --test packages/duel-backend/test/alert.test.ts
//
// Tests for sendAlert + withAlert. Mirrors monorepo conventions:
//   - node:test built-in runner, node:assert/strict for assertions
//   - hand-rolled mocks injected via the deps seam (matches cron-*.test.ts)
//
// Covers:
//   1. webhook set + no prior dedup row → fetch posts payload
//   2. webhook unset → no fetch, console.warn, no throw
//   3. withAlert wraps a throwing handler → alert sent + original error rethrown
//   4. withAlert wraps a passing handler → no alert
//   5. dedup: two failures of same cron within 1h → only first POSTs

import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendAlert, withAlert } from "../src/lib/alert";

// ─── Mock builders ────────────────────────────────────────────────────────

type FetchCall = { url: string; init?: RequestInit };

function makeFetch(): { fn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response("", { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

interface DedupState {
  lastSent: string | null;
  inserts: Array<{ cron: string; sent_at: string }>;
}

function makeSupabase(state: DedupState): SupabaseClient {
  // Minimal stub matching the surface alert.ts touches:
  //   .from("v2_alert_history").select(...).eq(...).order(...).limit(...).maybeSingle()
  //   .from("v2_alert_history").insert({...})
  const stub = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                order(_c: string, _opts: unknown) {
                  return {
                    limit(_n: number) {
                      return {
                        async maybeSingle() {
                          return {
                            data: state.lastSent
                              ? { sent_at: state.lastSent }
                              : null,
                            error: null,
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        async insert(payload: { cron: string; sent_at?: string }) {
          state.inserts.push({
            cron: payload.cron,
            sent_at: payload.sent_at ?? new Date().toISOString(),
          });
          return { error: null };
        },
      };
    },
  };
  return stub as unknown as SupabaseClient;
}

async function withEnv<T>(
  key: string,
  value: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

test("sendAlert_DiscordWebhookSet_PostsPayload", async () => {
  const { fn: fetchFn, calls } = makeFetch();
  const state: DedupState = { lastSent: null, inserts: [] };
  const supabase = makeSupabase(state);

  await withEnv("DISCORD_ALERTS_WEBHOOK", "https://discord.example/hook", async () => {
    await sendAlert(
      { cron: "test-cron", error: new Error("boom") },
      { fetch: fetchFn, supabase },
    );
  });

  assert.equal(calls.length, 1, "expected one webhook POST");
  assert.equal(calls[0].url, "https://discord.example/hook");
  assert.equal(calls[0].init?.method, "POST");
  const body = JSON.parse(String(calls[0].init?.body));
  assert.match(body.content, /test-cron/);
  assert.match(body.embeds[0].description, /Error: boom/);
  assert.equal(state.inserts.length, 1, "expected dedup row inserted");
  assert.equal(state.inserts[0].cron, "test-cron");
});

test("sendAlert_WebhookNotSet_NoOpWithWarning", async () => {
  const { fn: fetchFn, calls } = makeFetch();
  const state: DedupState = { lastSent: null, inserts: [] };
  const supabase = makeSupabase(state);

  const warnings: unknown[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    await withEnv("DISCORD_ALERTS_WEBHOOK", undefined, async () => {
      await sendAlert(
        { cron: "test-cron", error: new Error("boom") },
        { fetch: fetchFn, supabase },
      );
    });
  } finally {
    console.warn = origWarn;
  }

  assert.equal(calls.length, 0, "no POST when webhook unset");
  assert.equal(state.inserts.length, 0, "no dedup insert when webhook unset");
  assert.ok(
    warnings.some((args) => String((args as unknown[])[0]).includes("not set")),
    "expected a 'not set' warning",
  );
});

test("withAlert_HandlerThrows_SendsAlertAndRethrows", async () => {
  const { fn: fetchFn, calls } = makeFetch();
  const state: DedupState = { lastSent: null, inserts: [] };
  const supabase = makeSupabase(state);
  const sentinel = new Error("handler-fail");

  const wrapped = withAlert(
    "settle-tournaments",
    async () => {
      throw sentinel;
    },
    { fetch: fetchFn, supabase },
  );

  let caught: unknown;
  await withEnv("DISCORD_ALERTS_WEBHOOK", "https://discord.example/hook", async () => {
    try {
      await wrapped();
    } catch (err) {
      caught = err;
    }
  });

  assert.equal(caught, sentinel, "original error must be rethrown unchanged");
  assert.equal(calls.length, 1, "alert should fire once on handler throw");
  const body = JSON.parse(String(calls[0].init?.body));
  assert.match(body.content, /settle-tournaments/);
});

test("withAlert_HandlerSucceeds_NoAlert", async () => {
  const { fn: fetchFn, calls } = makeFetch();
  const state: DedupState = { lastSent: null, inserts: [] };
  const supabase = makeSupabase(state);

  const wrapped = withAlert(
    "update-ratings",
    async () => ({ ok: true, processed: 0 }),
    { fetch: fetchFn, supabase },
  );

  const result = await withEnv(
    "DISCORD_ALERTS_WEBHOOK",
    "https://discord.example/hook",
    async () => await wrapped(),
  );

  assert.deepEqual(result, { ok: true, processed: 0 });
  assert.equal(calls.length, 0, "no alert on successful handler");
});

test("dedupWindow_RepeatedFailureWithin1h_OnlyOneAlert", async () => {
  const { fn: fetchFn, calls } = makeFetch();
  const lastSent = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
  const state: DedupState = { lastSent, inserts: [] };
  const supabase = makeSupabase(state);

  await withEnv("DISCORD_ALERTS_WEBHOOK", "https://discord.example/hook", async () => {
    await sendAlert(
      { cron: "reconcile-duels", error: new Error("boom-2") },
      { fetch: fetchFn, supabase },
    );
  });

  assert.equal(calls.length, 0, "second failure within 1h should be deduped");
  assert.equal(state.inserts.length, 0, "no new dedup row on dedup hit");
});
