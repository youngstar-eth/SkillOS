// Offline harness for zero-config agent-identity resolution (W → tokenId).
//
// No network: the explorer fetch and the on-chain ownerOf verify are injected
// (ResolveDeps). One test exercises the REAL Blockscout parser against a stubbed
// global.fetch so the page-walking + registry-filtering logic is covered too.
//
// HOME is redirected to a temp dir so the file cache never touches ~/.skillos.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AgentIdResolutionError,
  AmbiguousAgentIdError,
  MissingAgentAddressError,
  MissingAgentIdError,
  type SkillOSMcpConfig,
} from '../src/config.js';
import {
  resolveAgentId,
  fetchOwnedTokenIdsFromExplorer,
  readFileCache,
  writeFileCache,
  _clearSessionCacheForTests,
} from '../src/identity/resolve.js';

const W = '0x352774c4f58b09d83e6F6B55b60dc8008342bc09';
const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';

function makeConfig(overrides: Partial<SkillOSMcpConfig> = {}): SkillOSMcpConfig {
  return {
    env: 'testnet',
    baseUrl: 'https://api.skillos.network',
    agentAddress: W as `0x${string}`,
    agentId: null,
    siwaDomain: 'skillos.network',
    registryAddress: REGISTRY as `0x${string}`,
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://base-sepolia.blockscout.com',
    ...overrides,
  };
}

let tmpHome: string;
let savedHome: string | undefined;
const realFetch = globalThis.fetch;

before(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'skillos-mcp-test-'));
  savedHome = process.env.HOME;
  process.env.HOME = tmpHome;
});

after(() => {
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  globalThis.fetch = realFetch;
  rmSync(tmpHome, { recursive: true, force: true });
});

beforeEach(() => {
  _clearSessionCacheForTests();
  // wipe any cache files between tests
  rmSync(join(tmpHome, '.skillos'), { recursive: true, force: true });
});

// 1. explicit override short-circuits everything (no fetch, no chain).
test('explicit SKILLOS_AGENT_ID override wins without touching the explorer', async () => {
  const config = makeConfig({ agentId: 42 });
  const id = await resolveAgentId(config, {
    fetchOwnedTokenIds: async () => assert.fail('explorer must not be called when override is set'),
    verifyOwner: async () => assert.fail('verify must not be called when override is set'),
  });
  assert.equal(id, 42);
});

// 2. the canonical zero-config path: address only, single token, verified.
test('resolves W → 6593 from the explorer when no id is set, then caches it', async () => {
  const config = makeConfig();
  let fetchCalls = 0;
  const id = await resolveAgentId(config, {
    fetchOwnedTokenIds: async () => {
      fetchCalls++;
      return [6593];
    },
    verifyOwner: async (_c, agentId, owner) => agentId === 6593 && owner.toLowerCase() === W.toLowerCase(),
  });
  assert.equal(id, 6593);
  assert.equal(fetchCalls, 1);

  // file cache seeded with the right shape
  assert.equal(readFileCache(config, W), 6593);
  const path = join(tmpHome, '.skillos', `agent-id-84532-${W.toLowerCase()}.json`);
  assert.ok(existsSync(path));
  const persisted = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(persisted.agentId, 6593);
  assert.equal(persisted.registry.toLowerCase(), REGISTRY.toLowerCase());
  assert.equal(persisted.source, 'explorer');
});

// 3. session cache: a second resolve does not hit the explorer again.
test('session cache short-circuits a second resolve', async () => {
  const config = makeConfig();
  await resolveAgentId(config, { fetchOwnedTokenIds: async () => [6593], verifyOwner: async () => true });
  const id = await resolveAgentId(config, {
    fetchOwnedTokenIds: async () => assert.fail('explorer must not be called on a session-cache hit'),
  });
  assert.equal(id, 6593);
});

// 4. file cache: survives a process restart (session cleared) without network.
test('file cache resolves offline after the session cache is cleared', async () => {
  const config = makeConfig();
  writeFileCache(config, W, 6593, 'complete_register');
  _clearSessionCacheForTests();
  const id = await resolveAgentId(config, {
    fetchOwnedTokenIds: async () => {
      throw new Error('network down');
    },
  });
  assert.equal(id, 6593);
});

// 5. no identity → MissingAgentIdError.
test('zero owned tokens → MissingAgentIdError', async () => {
  const config = makeConfig();
  await assert.rejects(
    resolveAgentId(config, { fetchOwnedTokenIds: async () => [] }),
    (e: Error) => e instanceof MissingAgentIdError,
  );
});

// 6. more than one identity → AmbiguousAgentIdError (never guesses).
test('multiple owned tokens → AmbiguousAgentIdError listing candidates', async () => {
  const config = makeConfig();
  await assert.rejects(
    resolveAgentId(config, { fetchOwnedTokenIds: async () => [6593, 7000] }),
    (e: Error) => e instanceof AmbiguousAgentIdError && e.message.includes('6593') && e.message.includes('7000'),
  );
});

// 7. explorer unreachable + no cache → AgentIdResolutionError (recoverable).
test('explorer failure with no cache → AgentIdResolutionError', async () => {
  const config = makeConfig();
  await assert.rejects(
    resolveAgentId(config, {
      fetchOwnedTokenIds: async () => {
        throw new Error('ECONNREFUSED');
      },
    }),
    (e: Error) => e instanceof AgentIdResolutionError,
  );
});

// 8. explorer lag: token reported but ownerOf says otherwise → treated as no identity.
test('stale explorer result failing ownerOf → MissingAgentIdError', async () => {
  const config = makeConfig();
  await assert.rejects(
    resolveAgentId(config, { fetchOwnedTokenIds: async () => [6593], verifyOwner: async () => false }),
    (e: Error) => e instanceof MissingAgentIdError,
  );
});

// 9. missing wallet → MissingAgentAddressError.
test('missing agentAddress → MissingAgentAddressError', async () => {
  const config = makeConfig({ agentAddress: null });
  await assert.rejects(resolveAgentId(config), (e: Error) => e instanceof MissingAgentAddressError);
});

// 10. REAL Blockscout parser: page-walk + registry filter against a stubbed fetch.
test('fetchOwnedTokenIdsFromExplorer parses + filters + paginates Blockscout v2', async () => {
  const config = makeConfig();
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    if (!u.includes('next_cursor')) {
      // page 1: one matching token, one foreign-contract token (filtered out)
      return new Response(
        JSON.stringify({
          items: [
            { id: '6593', token: { address: REGISTRY } },
            { id: '999', token: { address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' } },
          ],
          next_page_params: { next_cursor: 'abc', type: 'ERC-721' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    // page 2: another matching token, then end
    return new Response(
      JSON.stringify({ items: [{ id: '6594', token: { address_hash: REGISTRY } }], next_page_params: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const ids = await fetchOwnedTokenIdsFromExplorer(config, W);
  assert.deepEqual(ids, [6593, 6594]);
  assert.equal(calls.length, 2);
  assert.ok(calls[0]!.includes(`/api/v2/addresses/${W}/nft`));
  assert.ok(calls[1]!.includes('next_cursor=abc'));

  globalThis.fetch = realFetch;
});

// 11. explorer non-2xx surfaces as a throw (→ AgentIdResolutionError upstream).
test('fetchOwnedTokenIdsFromExplorer throws on non-2xx', async () => {
  const config = makeConfig();
  globalThis.fetch = (async () => new Response('rate limited', { status: 429 })) as typeof fetch;
  await assert.rejects(fetchOwnedTokenIdsFromExplorer(config, W), /explorer HTTP 429/);
  globalThis.fetch = realFetch;
});
