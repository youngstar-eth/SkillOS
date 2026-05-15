// X15.3 unit tests — chargeRetryFee orchestration with mocked viem clients
// and Supabase. Full E2E (with x402 satisfaction + real chain submit) is
// deferred to X15.7 once X15.6 agent x402 client ships.
//
// Convention: node:test + node:assert/strict, matches games.test.ts.
// Run with: npx tsx --test apps/api/test/charge-retry-fee.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  chargeRetryFeeIfRequired,
  type ChargeRetryFeeDeps,
} from '../src/lib/duel/charge-retry-fee.js';

const TOURNAMENT_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000abc' as const;
const AGENT = '0x000000000000000000000000000000000000aBcd' as const;
const RETRY_FEE_BASE_UNITS = 1_000_000n; // 1 USDC

interface ReadCall {
  fn: string;
  args: readonly unknown[];
}
interface WriteCall {
  fn: string;
  args: readonly unknown[];
  dataSuffix?: `0x${string}`;
}

function makeStubs(opts: {
  priorSolo: bigint;
  allowance?: bigint;
  approveTx?: `0x${string}`;
  chargeTx?: `0x${string}`;
  chargeRevert?: Error;
}) {
  const reads: ReadCall[] = [];
  const writes: WriteCall[] = [];
  const inserts: Record<string, unknown>[] = [];

  const publicClient = {
    async readContract(c: { functionName: string; args: readonly unknown[] }) {
      reads.push({ fn: c.functionName, args: c.args });
      if (c.functionName === 'soloSubmissionCount') return opts.priorSolo;
      if (c.functionName === 'allowance') return opts.allowance ?? 0n;
      throw new Error(`unexpected readContract: ${c.functionName}`);
    },
    async waitForTransactionReceipt(_c: { hash: `0x${string}` }) {
      return {};
    },
  };

  const agentWalletClient = {
    async writeContract(c: {
      functionName: string;
      args: readonly unknown[];
      dataSuffix?: `0x${string}`;
    }) {
      writes.push({
        fn: c.functionName,
        args: c.args,
        dataSuffix: c.dataSuffix,
      });
      if (c.functionName === 'approve') return opts.approveTx ?? '0xa1';
      if (c.functionName === 'chargeRetryFee') {
        if (opts.chargeRevert) throw opts.chargeRevert;
        return opts.chargeTx ?? '0xc1';
      }
      throw new Error(`unexpected writeContract: ${c.functionName}`);
    },
  };

  const supabase = {
    from(_table: string) {
      return {
        async insert(row: Record<string, unknown>) {
          inserts.push(row);
          return { error: null };
        },
      };
    },
  };

  const deps: ChargeRetryFeeDeps = {
    publicClient: publicClient as unknown as ChargeRetryFeeDeps['publicClient'],
    agentWalletClient:
      agentWalletClient as unknown as ChargeRetryFeeDeps['agentWalletClient'],
    supabase: supabase as unknown as ChargeRetryFeeDeps['supabase'],
  };

  return { deps, reads, writes, inserts };
}

test('priorSolo == 0 → returns free-first; no writes; skipped audit row', async () => {
  const { deps, reads, writes, inserts } = makeStubs({ priorSolo: 0n });
  const result = await chargeRetryFeeIfRequired(
    { tournamentId: TOURNAMENT_ID, agentAddress: AGENT, runId: 'r1', game: '2048' },
    deps,
  );

  assert.equal(result.charged, false);
  if (result.charged === false) {
    assert.equal(result.reason, 'free-first');
    assert.equal(result.priorSolo, 0);
  }

  assert.equal(reads.length, 1);
  assert.equal(reads[0].fn, 'soloSubmissionCount');
  assert.deepEqual(reads[0].args, [TOURNAMENT_ID, AGENT]);

  assert.equal(writes.length, 0);

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].status, 'skipped');
  assert.equal(inserts[0].reason, 'free-first');
  assert.equal(inserts[0].prior_solo, 0);
});

test('priorSolo >= 1 + allowance == 0 → approve then chargeRetryFee; both txs recorded', async () => {
  const { deps, reads, writes, inserts } = makeStubs({
    priorSolo: 1n,
    allowance: 0n,
    approveTx: '0xa0',
    chargeTx: '0xc0',
  });
  const result = await chargeRetryFeeIfRequired(
    { tournamentId: TOURNAMENT_ID, agentAddress: AGENT, runId: 'r2', game: '2048' },
    deps,
  );

  assert.equal(result.charged, true);
  if (result.charged) {
    assert.equal(result.txHash, '0xc0');
    assert.equal(result.approveTxHash, '0xa0');
    assert.equal(result.priorSolo, 1);
  }

  assert.equal(reads.length, 2);
  assert.equal(reads[0].fn, 'soloSubmissionCount');
  assert.equal(reads[1].fn, 'allowance');

  assert.equal(writes.length, 2);
  assert.equal(writes[0].fn, 'approve');
  assert.equal(writes[1].fn, 'chargeRetryFee');
  assert.deepEqual(writes[1].args, [TOURNAMENT_ID, AGENT]);

  // 2048 Builder Code (bc_o6szuvg1, 11 chars) → ASCII-hex = 22 hex chars + '0x'.
  // Pinned regression guard for the X10 attribution wire.
  assert.equal(writes[1].dataSuffix, '0x62635f6f36737a75766731');

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].status, 'success');
  assert.equal(inserts[0].tx_hash, '0xc0');
  assert.equal(inserts[0].approve_tx_hash, '0xa0');
  assert.equal(inserts[0].prior_solo, 1);
});

test('priorSolo >= 1 + allowance sufficient → no approve; just chargeRetryFee', async () => {
  const { deps, reads, writes } = makeStubs({
    priorSolo: 3n,
    allowance: RETRY_FEE_BASE_UNITS * 10n,
    chargeTx: '0xc3',
  });
  const result = await chargeRetryFeeIfRequired(
    { tournamentId: TOURNAMENT_ID, agentAddress: AGENT, runId: 'r3', game: '2048' },
    deps,
  );

  assert.equal(result.charged, true);
  if (result.charged) {
    assert.equal(result.approveTxHash, undefined);
    assert.equal(result.priorSolo, 3);
  }

  assert.equal(reads.length, 2);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].fn, 'chargeRetryFee');
});

test('chargeRetryFee throws → records error audit row and re-throws', async () => {
  const revert = new Error('mock revert PlayerMismatch');
  const { deps, inserts } = makeStubs({
    priorSolo: 2n,
    allowance: RETRY_FEE_BASE_UNITS * 10n,
    chargeRevert: revert,
  });

  await assert.rejects(
    chargeRetryFeeIfRequired(
      { tournamentId: TOURNAMENT_ID, agentAddress: AGENT, runId: 'r4', game: '2048' },
      deps,
    ),
    /PlayerMismatch/,
  );

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].status, 'error');
  assert.equal(inserts[0].prior_solo, 2);
  assert.equal(inserts[0].error_message, 'mock revert PlayerMismatch');
});

test('audit row stores agent_address lowercased (db query convenience)', async () => {
  const { deps, inserts } = makeStubs({ priorSolo: 0n });
  await chargeRetryFeeIfRequired(
    { tournamentId: TOURNAMENT_ID, agentAddress: AGENT, runId: 'r5', game: '2048' },
    deps,
  );
  assert.equal(inserts[0].agent_address, AGENT.toLowerCase());
});
