// Unit coverage for the B2-A x402 data-fetch wiring. No network, no payment:
// the PaidFetcher is mocked, and buildPaidFetcherFromConfig is exercised only
// for its key-resolution branch (a valid dummy key builds a viem account but
// never hits the network until .get() is called).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPaidFetcherFromConfig, type PaidFetcher } from '../src/paid-fetch.js';
import { MissingX402PayerKeyError } from '../src/config.js';
import { fetchCohortSnapshot } from '../src/tools/fetch_cohort_snapshot.js';
import { fetchMatchReplay, matchReplayPath } from '../src/tools/fetch_match_replay.js';

// A structurally-valid secp256k1 key (NEVER funded) — proves account build only.
const DUMMY_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111' as const;
const BASE_URL = 'https://api.skillos.network';

function mockFetcher(): PaidFetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async get<T = unknown>(path: string): Promise<T> {
      calls.push(path);
      return { ok: true, path } as T;
    },
  };
}

test('buildPaidFetcherFromConfig throws MissingX402PayerKeyError when key unset', () => {
  assert.throws(
    () => buildPaidFetcherFromConfig({ x402PayerKey: null, baseUrl: BASE_URL }),
    (e: Error) => e instanceof MissingX402PayerKeyError,
  );
});

test('buildPaidFetcherFromConfig builds a fetcher for a valid key (no network)', () => {
  const fetcher = buildPaidFetcherFromConfig({ x402PayerKey: DUMMY_KEY, baseUrl: BASE_URL });
  assert.equal(typeof fetcher.get, 'function');
});

test('fetchCohortSnapshot GETs the T3 path and wraps JSON as text', async () => {
  const fetcher = mockFetcher();
  const result = await fetchCohortSnapshot(fetcher);
  assert.deepEqual(fetcher.calls, ['/v1/data/cohort-snapshot']);
  assert.equal(result.content[0]!.type, 'text');
  assert.equal(
    result.content[0]!.text,
    JSON.stringify({ ok: true, path: '/v1/data/cohort-snapshot' }, null, 2),
  );
});

test('matchReplayPath builds the per-tournament T2 path', () => {
  const id = '0x' + 'a'.repeat(64);
  assert.equal(matchReplayPath(id), `/v1/data/match-replay/${id}`);
});

test('fetchMatchReplay GETs the per-tournament path and wraps JSON as text', async () => {
  const fetcher = mockFetcher();
  const id = '0x' + 'b'.repeat(64);
  const result = await fetchMatchReplay(fetcher, id);
  assert.deepEqual(fetcher.calls, [`/v1/data/match-replay/${id}`]);
  assert.equal(result.content[0]!.type, 'text');
});
