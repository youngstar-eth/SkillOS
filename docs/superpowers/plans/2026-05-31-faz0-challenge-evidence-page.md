# Faz-0 Challenge-Evidence Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only public page at `2048.skillos.games/challenge` that tells one story — *"a false score was claimed, caught, and economically slashed — and anyone can re-run the same engine to verify it"* — by reusing the already-deployed Faz-0 `SettlementDemo` (Base Sepolia `0xD7323fCCa888793D5c92F006911DB06Af3CF8B1E`) and the on-main `@skillos/engines` Δ6 replay engine.

**Architecture:** A Next.js App Router **server component** (`/challenge`) that renders the honest + fraud loops from static, on-chain-anchored facts and **recomputes the Δ6 verdict at render time** (pure, sync) via a small resolver helper that mirrors `scripts/faz0/resolver.ts`. Every fact links to **Blockscout (Base Sepolia)** for independent verification; a prominent copy-paste "reproduce the verdict" block is the page's strongest element. **No production writes, no keys, no contract changes, no PR #179 merge.**

**Tech Stack:** Next.js 16 (App Router, server components), TypeScript, Tailwind (existing 2048 design tokens), `@skillos/engines` (Δ6 `verifyMatch` / `engine2048`), `viem` (`keccak256`/`toBytes`, already a dep), `node:test` via `tsx` (repo test convention).

---

## §2.10 Pre-flight gates (BEFORE any write — MANDATORY per CLAUDE.md)

**State assumptions:**
- Work happens in an **isolated worktree**, never shared `/Users/inancayvaz/MAS` mainline (§3.22).
- `main` HEAD is `622dc40` (Δ6 Stage 2). `@skillos/engines` is on main and exports `verifyMatch`, `engine2048`, `Move2048`, `MoveRecord`.
- `SettlementDemo.sol` is **NOT on main** (faz0-challenge-demo branch only); the deployed instance `0xD73…B1E` is live on Base Sepolia `84532`. The page references the deployed address + Blockscout, NOT the `.sol` source.
- PR #179 is **OPEN — must NOT be merged** by this work.
- `apps/2048` does **not** yet depend on `@skillos/engines`.
- The page performs **zero on-chain or DB writes**.

**Verification commands (run before writing):**

```bash
# 1. Not on shared mainline; on an isolated branch
git rev-parse --show-toplevel        # Expect: a worktree path, NOT /Users/inancayvaz/MAS
git branch --show-current            # Expect: a dedicated feat/* branch, not main

# 2. @skillos/engines is on main and the golden vector + commit are exact
npx tsx -e "import {verifyMatch} from '@skillos/engines'; const m=['left','down','right','up','left','left','down']; console.log(JSON.stringify(verifyMatch('2048','replay-determinism',m.map((move,seq)=>({seq,move})))));"
# Expect: {"score":20,"valid":true}
npx tsx -e "import {keccak256,toBytes} from 'viem'; console.log(keccak256(toBytes('replay-determinism')));"
# Expect: 0x3d73a8824f5363670690e631fd24e631cf7bca266a6eb0871afc58b7ed16420d

# 3. SettlementDemo is NOT on main (confirm we are reusing the deployed instance, not source)
git show HEAD:contracts/src/SettlementDemo.sol 2>&1 | head -1
# Expect: fatal: path 'contracts/src/SettlementDemo.sol' ... does not exist

# 4. PR #179 still open (we must not have merged it)
gh pr view 179 -R youngstar-eth/SkillOS --json state -q .state   # Expect: OPEN
```

**STOP CONDITIONS:** any command diverges from Expect; `git branch --show-current` is `main`; PR #179 shows `MERGED`; the golden score ≠ 20 or commit ≠ `0x3d73…16420d`. → STOP and surface to founder.

**Surfaces triangulated:** Repo (git/source) + Runtime (engine exec + Blockscout/`gh`) + Memory (faz0 evidence doc). ≥2 ✔.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `apps/2048/package.json` | Add `@skillos/engines` workspace dep | Modify |
| `apps/2048/src/lib/faz0/resolver.ts` | Pure Δ6 verdict recompute (`commitSeed`, `resolveClaim`, `toInputLog`) — mirrors `scripts/faz0/resolver.ts` | Create |
| `apps/2048/src/lib/faz0/resolver.test.ts` | `node:test` locking the honest/fraud verdicts + seed commit | Create |
| `apps/2048/src/lib/faz0/evidence.ts` | Static on-chain facts (txs, roles, ids, golden vector) + Blockscout link helpers + honest-label string | Create |
| `apps/2048/src/app/challenge/page.tsx` | The read-only story page (server component) | Create |
| `apps/2048/src/app/page.tsx` (or header) | Add a nav link to `/challenge` | Modify |

All five game-logic files are pure/read-only. The only runtime dependency added is a pure compute package already used by `@skillos/mcp`.

---

### Task 1: Add `@skillos/engines` dependency to the 2048 app

**Files:**
- Modify: `apps/2048/package.json` (dependencies block, alphabetical among `@skillos/*`)

- [ ] **Step 1: Add the workspace dependency**

In `apps/2048/package.json`, inside `"dependencies"`, add the line so the `@skillos/*` block reads (insert after `"@skillos/duel-backend": "*",`):

```json
    "@skillos/duel-backend": "*",
    "@skillos/engines": "*",
    "@skillos/game-types": "*",
```

- [ ] **Step 2: Install to materialize the workspace symlink**

Run: `npm install`
Expected: completes; `ls -la node_modules/@skillos/engines` resolves to `../../packages/engines`.

- [ ] **Step 3: Verify the app can resolve the package**

Run: `npx tsx -e "import {verifyMatch} from '@skillos/engines'; console.log(typeof verifyMatch)"`
Expected: `function`

- [ ] **Step 4: Commit**

```bash
git add apps/2048/package.json package-lock.json
git commit -m "build(2048): add @skillos/engines dep for Faz-0 evidence page"
```

---

### Task 2: Δ6 resolver helper (recompute the verdict, pure)

Mirrors `scripts/faz0/resolver.ts` (faz0 branch) but lives on main inside the 2048 app. Identical fraud rule: `replayedScore !== claimedScore`.

**Files:**
- Create: `apps/2048/src/lib/faz0/resolver.ts`
- Test: `apps/2048/src/lib/faz0/resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/2048/src/lib/faz0/resolver.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Move2048 } from "@skillos/engines";
import { commitSeed, resolveClaim, toInputLog } from "./resolver";

const SEED = "replay-determinism";
const GOLDEN_MOVES: Move2048[] = [
  "left", "down", "right", "up", "left", "left", "down",
];

test("commitSeed matches the on-chain SEED_COMMIT", () => {
  assert.equal(
    commitSeed(SEED),
    "0x3d73a8824f5363670690e631fd24e631cf7bca266a6eb0871afc58b7ed16420d",
  );
});

test("honest claim (20) replays to 20 and is not fraud", () => {
  const v = resolveClaim({
    seed: SEED,
    inputLog: toInputLog(GOLDEN_MOVES),
    claimedScore: 20,
  });
  assert.equal(v.replayedScore, 20);
  assert.equal(v.engineValid, true);
  assert.equal(v.fraud, false);
});

test("fraudulent claim (9999) replays to 20 and is fraud", () => {
  const v = resolveClaim({
    seed: SEED,
    inputLog: toInputLog(GOLDEN_MOVES),
    claimedScore: 9999,
  });
  assert.equal(v.replayedScore, 20);
  assert.equal(v.engineValid, true);
  assert.equal(v.fraud, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test apps/2048/src/lib/faz0/resolver.test.ts`
Expected: FAIL — cannot find module `./resolver`.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/2048/src/lib/faz0/resolver.ts`:

```ts
// Faz-0 — pure Δ6 verdict recompute for the public challenge-evidence page.
//
// Mirrors scripts/faz0/resolver.ts (faz0-challenge-demo branch) so the page can
// re-run the SAME public, deterministic 2048 engine the on-chain resolver used,
// WITHOUT merging PR #179. No key, no network, no broadcast — pure compute.
//
// The resolver is a convenience, not a trust root: anyone can re-run
// engine2048.verify(seed, inputLog) on the on-chain-revealed seed + anchored
// inputLog and reproduce the verdict ("deterministic-auditable").

import { keccak256, toBytes, type Hex } from "viem";
import { engine2048, type Move2048, type MoveRecord } from "@skillos/engines";

/** Mirrors the contract's keccak256(bytes(seed)) — off-chain commit == on-chain seedCommit. */
export function commitSeed(seed: string): Hex {
  return keccak256(toBytes(seed));
}

/** Wrap a flat move list into the canonical Δ6 inputLog envelope. */
export function toInputLog(moves: Move2048[]): MoveRecord<Move2048>[] {
  return moves.map((move, seq) => ({ seq, move }));
}

export interface ClaimToResolve {
  seed: string;
  inputLog: MoveRecord<Move2048>[];
  claimedScore: number;
}

export interface ResolverVerdict {
  /** Engine-authoritative replay score. */
  replayedScore: number;
  /** Whether the inputLog was well-formed under the engine. */
  engineValid: boolean;
  /** replayedScore !== claimedScore ⇒ fraud (matches the on-chain resolver). */
  fraud: boolean;
}

export function resolveClaim(claim: ClaimToResolve): ResolverVerdict {
  const { score, valid } = engine2048.verify(claim.seed, claim.inputLog);
  return {
    replayedScore: score,
    engineValid: valid,
    fraud: score !== claim.claimedScore,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test apps/2048/src/lib/faz0/resolver.test.ts`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add apps/2048/src/lib/faz0/resolver.ts apps/2048/src/lib/faz0/resolver.test.ts
git commit -m "feat(2048): Faz-0 Δ6 resolver helper (recompute verdict, pure)"
```

---

### Task 3: Static evidence constants + Blockscout link helpers

All values are copied verbatim from `docs/faz0/STAGE3-EVIDENCE.md` (faz0 branch). Explorer is **Base Sepolia Blockscout** per founder direction (do NOT default to mainnet).

**Files:**
- Create: `apps/2048/src/lib/faz0/evidence.ts`

- [ ] **Step 1: Create the constants module**

Create `apps/2048/src/lib/faz0/evidence.ts`:

```ts
// Faz-0 — static, on-chain-anchored facts for the challenge-evidence page.
//
// These are a CONVENIENCE SUMMARY. The source of truth is the chain (linked to
// Blockscout below) + the public Δ6 engine (recomputed live via ./resolver).
// Every value here is independently verifiable; the page says so explicitly.
//
// Verbatim from docs/faz0/STAGE3-EVIDENCE.md (faz0-challenge-demo branch).
// SettlementDemo is a STANDALONE Faz-0 demo: not the v2.3 production settle,
// not the audit-#1 fix, NOT wired into the production settlement path.

import type { Move2048 } from "@skillos/engines";

export const CHAIN_ID = 84532; // Base Sepolia
export const BLOCKSCOUT = "https://base-sepolia.blockscout.com";

export const txUrl = (hash: string) => `${BLOCKSCOUT}/tx/${hash}`;
export const addressUrl = (addr: string) => `${BLOCKSCOUT}/address/${addr}`;

/** Honest label the demo earns — never "trustless". */
export const HONEST_LABEL =
  "economically-secured optimistic, deterministic-auditable";

export const CONTRACT = {
  name: "SettlementDemo",
  address: "0xD7323fCCa888793D5c92F006911DB06Af3CF8B1E",
  deployTx:
    "0xbd0cc98e8976bf79c0a5a321aea62708336732092a243fbf40fd69d943f4f522",
} as const;

export const ROLES = {
  // A — deployer / owner / claimer
  owner: "0x3a4F9eB7fBa1A0015a6F070259F3B9E883d95EEe",
  // B — resolver (distinct EOA, enforced on-chain)
  resolver: "0xA24f9122568e98b72f4dDD61119C7D92D0975692",
  // C — challenger
  challenger: "0x724fCfeE408e0f05068feD0Bb5d1245EDd3a16F5",
} as const;

/** The committed seed + 7-move golden vector that replays to 20. */
export const GOLDEN = {
  seed: "replay-determinism",
  seedCommit:
    "0x3d73a8824f5363670690e631fd24e631cf7bca266a6eb0871afc58b7ed16420d",
  moves: ["left", "down", "right", "up", "left", "left", "down"] as Move2048[],
  score: 20,
} as const;

export const HONEST_LOOP = {
  arena: "0x6c2f124c131d1579ef93323facb395b286e5a62f3273bf0d51a3e9451becd75d",
  claim: "0x52054c761ca2750eaf8204d830c4eb5d1848a83ff634b5f1c833ee7352ca7a14",
  claimedScore: 20,
  finalizeTx:
    "0xc3653355d35d90b1912b77ae984cafa4d07d436b63562a25c12cdd91de1dfc39",
  finalState: "Finalized (3)",
  creditedScore: 20,
} as const;

export const FRAUD_LOOP = {
  arena: "0xf29c596bf664b2649bc001b7ffccc0d15f70696958ee63fa6b936d5f055195bc",
  claim: "0xc33692cc5c01a5a81c829bb0e3325a8ea0b1c180435da0ab35e9550a9a2dca10",
  claimedScore: 9999,
  challengeTx:
    "0x7ab769d66c37369494b25016d6bb9f733f3300c41a910f3ca5eeab3110377f8c",
  resolveTx:
    "0xc40372614aa656f5d2407464fc91f54daa2e3cf98508787197992538b20ae2fb",
  finalState: "ResolvedFraud (5)",
  creditedScore: 0,
  decodedEvent: {
    fraud: true,
    replayedScore: 20,
    claimedScore: 9999,
    slashed: "0x3a4F9eB7fBa1A0015a6F070259F3B9E883d95EEe", // A
    rewarded: "0x724fCfeE408e0f05068feD0Bb5d1245EDd3a16F5", // C
    pot: "200000000000000", // 2 × 0.0001 ETH
  },
} as const;

/** Full ordered tx trail (10 txs) — for the "verify it yourself" table. */
export const ALL_TXS: ReadonlyArray<{
  step: string;
  signer: "A" | "B" | "C";
  hash: string;
}> = [
  { step: "deploy SettlementDemo", signer: "A", hash: CONTRACT.deployTx },
  { step: "createArena (honest)", signer: "A", hash: "0x6193a2a98e747003c14d8bc3b9a3b5b7d776d6d2b99430127317b3a256dcb61c" },
  { step: "revealSeed (honest)", signer: "A", hash: "0xe64604cdb3bf58fe351ed39f6dda61506f9bd1d45f0ef5320f893a4454097583" },
  { step: "submitClaim 20 (honest)", signer: "A", hash: "0xde2984f1ca924c2bea449d9a7263ee24e0d26bcbf7d1f78208f300d5be03c714" },
  { step: "createArena (fraud)", signer: "A", hash: "0xeb1231c9522e891040b46cbd8024bc989ef80393bb67782e01b50e779c8ad18b" },
  { step: "revealSeed (fraud)", signer: "A", hash: "0xe2d6e47d1ad5fb6df89c1af014a0853cf6114c1b09ef90046700679a3216019c" },
  { step: "submitClaim 9999 (fraud)", signer: "A", hash: "0x40e8b7e2e337d3a0880080466b9a7db38f735316b196992c85e10c3efa47bd2f" },
  { step: "challenge (fraud)", signer: "C", hash: FRAUD_LOOP.challengeTx },
  { step: "resolve → slash (fraud)", signer: "B", hash: FRAUD_LOOP.resolveTx },
  { step: "finalize → credit (honest)", signer: "A", hash: HONEST_LOOP.finalizeTx },
];
```

- [ ] **Step 2: Typecheck the module**

Run: `npx tsc --noEmit -p apps/2048/tsconfig.json`
Expected: no errors referencing `faz0/evidence.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/2048/src/lib/faz0/evidence.ts
git commit -m "feat(2048): Faz-0 static evidence constants + Blockscout links"
```

---

### Task 4: The `/challenge` evidence page (server component)

Renders the story, recomputes the Δ6 verdict at render, embeds the prominent reproduce-it block, and links everything to Blockscout. Server component (no `"use client"`) so it renders fully in HTML. Mirrors the 2048 design idiom from `apps/2048/src/app/leaderboard/page.tsx` (tokens: `border-border`, `bg-bg-elev`, `bg-bg-elev2`, `text-skill`, `text-neutral-*`, `rounded-2xl`, `divide-border-subtle`).

**Files:**
- Create: `apps/2048/src/app/challenge/page.tsx`

- [ ] **Step 1: Create the page**

Create `apps/2048/src/app/challenge/page.tsx`:

```tsx
// Faz-0 challenge-evidence page — /challenge.
//
// One story: a false score was claimed, challenged, and economically slashed —
// and anyone can re-run the same public engine to reproduce the verdict.
// Read-only. Static facts are a convenience summary; the chain (Blockscout) and
// the Δ6 engine (recomputed below) are the source of truth.

import {
  CONTRACT,
  ROLES,
  GOLDEN,
  HONEST_LOOP,
  FRAUD_LOOP,
  ALL_TXS,
  HONEST_LABEL,
  CHAIN_ID,
  txUrl,
  addressUrl,
} from "@/lib/faz0/evidence";
import { resolveClaim, commitSeed, toInputLog } from "@/lib/faz0/resolver";

export const metadata = {
  title: "Challenge & Verify — SkillOS",
  description:
    "A false score was claimed, caught, and economically slashed on Base Sepolia. Re-run the same public engine and verify it yourself.",
};

const REPRODUCE_SNIPPET = `import { verifyMatch } from "@skillos/engines";

const seed = "${GOLDEN.seed}";
const moves = ${JSON.stringify(GOLDEN.moves)};
const log = moves.map((move, seq) => ({ seq, move }));

verifyMatch("2048", seed, log);
// => { score: ${GOLDEN.score}, valid: true }
// claimed 9999 ≠ replayed ${GOLDEN.score}  ⇒  fraud`;

export default function ChallengePage() {
  const inputLog = toInputLog(GOLDEN.moves);
  const honest = resolveClaim({
    seed: GOLDEN.seed,
    inputLog,
    claimedScore: HONEST_LOOP.claimedScore,
  });
  const fraud = resolveClaim({
    seed: GOLDEN.seed,
    inputLog,
    claimedScore: FRAUD_LOOP.claimedScore,
  });
  const recomputedCommit = commitSeed(GOLDEN.seed);

  return (
    <main className="py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Hero */}
        <section className="rounded-2xl border border-border bg-bg-elev p-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            Faz-0 · Base Sepolia · standalone demo
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            A false score was caught — and economically slashed.
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            One claim told the truth (score {GOLDEN.score}) and was credited.
            One lied (score {FRAUD_LOOP.claimedScore.toLocaleString()}), was
            challenged, and a resolver re-ran the public 2048 engine — the wrong
            side lost its bond. You don&apos;t have to trust us:{" "}
            <span className="text-neutral-200">re-run the engine yourself</span>{" "}
            below.
          </p>
          <p className="mt-3 inline-block rounded-lg border border-border bg-bg-elev2 px-3 py-1.5 text-xs text-neutral-300">
            Honest label: <span className="text-skill">{HONEST_LABEL}</span> —
            not &ldquo;cryptographically trustless.&rdquo;
          </p>
        </section>

        {/* The two loops */}
        <section className="grid gap-4 sm:grid-cols-2">
          <LoopCard
            tone="honest"
            title="Honest → finalized → credited"
            claimed={HONEST_LOOP.claimedScore}
            credited={HONEST_LOOP.creditedScore}
            finalState={HONEST_LOOP.finalState}
            verdict={honest}
            links={[
              { label: "finalize tx", href: txUrl(HONEST_LOOP.finalizeTx) },
            ]}
          />
          <LoopCard
            tone="fraud"
            title="Fraud → challenged → resolved → slashed"
            claimed={FRAUD_LOOP.claimedScore}
            credited={FRAUD_LOOP.creditedScore}
            finalState={FRAUD_LOOP.finalState}
            verdict={fraud}
            links={[
              { label: "challenge tx", href: txUrl(FRAUD_LOOP.challengeTx) },
              { label: "resolve / slash tx", href: txUrl(FRAUD_LOOP.resolveTx) },
            ]}
          />
        </section>

        {/* Reproduce-it — the strongest element */}
        <section className="rounded-2xl border border-skill/40 bg-bg-elev p-6">
          <h2 className="text-sm font-semibold tracking-tight text-skill">
            Reproduce the verdict yourself
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            These facts are independently verifiable — here&apos;s how. Run the
            same public, deterministic Δ6 engine on the on-chain-revealed seed.
            This page just did exactly that at render time:{" "}
            <span className="text-neutral-200">
              replayed score {honest.replayedScore}
            </span>
            , so claim 20 is honest and claim 9,999 is fraud.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-bg-elev2 p-4 text-xs leading-relaxed text-neutral-200">
            <code>{REPRODUCE_SNIPPET}</code>
          </pre>
          <p className="mt-3 text-xs text-neutral-500">Or with the resolver CLI:</p>
          <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-bg-elev2 p-4 text-xs leading-relaxed text-neutral-200">
            <code>{`# honest → score 20, fraud:false
npx tsx scripts/faz0/run-resolver.ts
# fraud → replayed 20 ≠ claimed 9999 ⇒ fraud:true
CLAIMED_SCORE=9999 npx tsx scripts/faz0/run-resolver.ts`}</code>
          </pre>
          <p className="mt-3 text-[11px] text-neutral-500">
            Seed <code className="text-neutral-300">&quot;{GOLDEN.seed}&quot;</code>{" "}
            commits to{" "}
            <code className="break-all text-neutral-300">{recomputedCommit}</code>{" "}
            (keccak256) — re-derived in your browser and matching the on-chain
            seedCommit.
          </p>
        </section>

        {/* On-chain evidence */}
        <section className="rounded-2xl border border-border bg-bg-elev p-6">
          <h2 className="text-sm font-semibold tracking-tight">
            On-chain evidence
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Static facts are a convenience; the chain and the engine are the
            source of truth. All links resolve to Base Sepolia (chain {CHAIN_ID})
            on Blockscout.
          </p>

          <dl className="mt-4 space-y-2 text-xs">
            <EvidenceRow label="SettlementDemo">
              <ExtLink href={addressUrl(CONTRACT.address)} mono>
                {CONTRACT.address}
              </ExtLink>
            </EvidenceRow>
            <EvidenceRow label="owner / claimer (A)">
              <ExtLink href={addressUrl(ROLES.owner)} mono>
                {ROLES.owner}
              </ExtLink>
            </EvidenceRow>
            <EvidenceRow label="resolver (B)">
              <ExtLink href={addressUrl(ROLES.resolver)} mono>
                {ROLES.resolver}
              </ExtLink>
            </EvidenceRow>
            <EvidenceRow label="challenger (C)">
              <ExtLink href={addressUrl(ROLES.challenger)} mono>
                {ROLES.challenger}
              </ExtLink>
            </EvidenceRow>
          </dl>

          <div className="mt-5 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-bg-elev2 text-[10px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Step</th>
                  <th className="px-3 py-2">Signer</th>
                  <th className="px-3 py-2 text-right">Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {ALL_TXS.map((t, i) => (
                  <tr key={t.hash} className="text-neutral-300">
                    <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2">{t.step}</td>
                    <td className="px-3 py-2">{t.signer}</td>
                    <td className="px-3 py-2 text-right">
                      <ExtLink href={txUrl(t.hash)} mono>
                        {t.hash.slice(0, 10)}…
                      </ExtLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Honest scope disclaimer */}
        <section className="rounded-2xl border border-dashed border-border p-5">
          <p className="text-[11px] leading-relaxed text-neutral-500">
            <span className="text-neutral-400">Scope:</span> SettlementDemo is a
            standalone Faz-0 pitch demo. It is <em>not</em> the production
            settlement path, <em>not</em> the v2.3 settle, and <em>not</em> an
            audit fix. A score is <em>claimed</em> (not re-executed on-chain);
            the security property is <em>challenge + deterministic replay</em>,
            not on-chain re-execution.
          </p>
        </section>
      </div>
    </main>
  );
}

function LoopCard({
  tone,
  title,
  claimed,
  credited,
  finalState,
  verdict,
  links,
}: {
  tone: "honest" | "fraud";
  title: string;
  claimed: number;
  credited: number;
  finalState: string;
  verdict: { replayedScore: number; fraud: boolean };
  links: { label: string; href: string }[];
}) {
  const accent = tone === "fraud" ? "text-red-400" : "text-skill";
  return (
    <div className="rounded-2xl border border-border bg-bg-elev p-5">
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${accent}`}>
        {tone}
      </p>
      <h3 className="mt-1 text-sm font-semibold tracking-tight text-neutral-200">
        {title}
      </h3>
      <dl className="mt-3 space-y-1.5 text-xs text-neutral-400">
        <Stat k="Claimed score" v={claimed.toLocaleString()} />
        <Stat k="Δ6 replayed score" v={verdict.replayedScore.toLocaleString()} />
        <Stat k="Verdict" v={verdict.fraud ? "FRAUD" : "honest"} accent={accent} />
        <Stat k="Final state" v={finalState} />
        <Stat k="Credited" v={credited.toLocaleString()} />
      </dl>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {links.map((l) => (
          <ExtLink key={l.href} href={l.href}>
            {l.label} ↗
          </ExtLink>
        ))}
      </div>
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{k}</dt>
      <dd className={`tabular-nums ${accent ?? "text-neutral-200"}`}>{v}</dd>
    </div>
  );
}

function EvidenceRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ExtLink({
  href,
  children,
  mono,
}: {
  href: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-skill underline-offset-4 hover:underline ${
        mono ? "break-all font-mono" : ""
      }`}
    >
      {children}
    </a>
  );
}
```

> **Note on `@/` alias:** `apps/2048/src/app/leaderboard/page.tsx` imports `@skillos/ui` and uses relative paths; confirm the `@/` → `src/*` path alias exists in `apps/2048/tsconfig.json`. If it does not, replace `@/lib/faz0/...` with the correct relative path (`../../lib/faz0/...`). Verify before writing: `grep -A3 '"paths"' apps/2048/tsconfig.json`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/2048/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd apps/2048 && npx eslint src/app/challenge/page.tsx src/lib/faz0`
Expected: no errors.

- [ ] **Step 4: Build (smoke the route)**

Run: `cd apps/2048 && npm run build`
Expected: build succeeds; `/challenge` appears in the route manifest.

- [ ] **Step 5: Verify rendered output (real browser)**

Run `npm run dev` in `apps/2048`, then with the preview/Playwright tools open `http://localhost:3000/challenge` and snapshot.
Expected: hero, both loop cards (honest verdict "honest", fraud verdict "FRAUD", replayed score 20 in both), the reproduce block, and the 10-row tx table with Blockscout links.

- [ ] **Step 6: Commit**

```bash
git add apps/2048/src/app/challenge/page.tsx
git commit -m "feat(2048): /challenge Faz-0 evidence page (read-only, verify-yourself)"
```

---

### Task 5: Link the page into the loop

Make the page reachable so the public loop is coherent (watch → challenge → leaderboard).

**Files:**
- Modify: `apps/2048/src/app/page.tsx` **or** the shared header component (whichever holds nav links — inspect first)

- [ ] **Step 1: Find the nav surface**

Run: `grep -rn "leaderboard" apps/2048/src/app/page.tsx apps/2048/src/components 2>/dev/null | head`
Expected: a link to `/leaderboard` you can sit a `/challenge` link beside.

- [ ] **Step 2: Add the link**

Beside the existing leaderboard link, add (matching the surrounding link's classes):

```tsx
<Link href="/challenge">Challenge &amp; Verify</Link>
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit -p apps/2048/tsconfig.json`  (Expected: no errors)

```bash
git add apps/2048/src/app/page.tsx
git commit -m "feat(2048): link /challenge into nav for loop coherence"
```

> **NOTE (separate, out of this repo's scope):** the `skillos.network/watch/<id>` replay surface should also link to `/challenge`. That surface was not located in this monorepo's `apps/` — track adding the watch→/challenge link as a follow-up against whichever project serves `skillos.network/watch`.

---

### Task 6: Full verification + PR (no merge of #179)

- [ ] **Step 1: Run the four CI gates locally**

```bash
npx tsc --noEmit -p apps/2048/tsconfig.json                  # typecheck
node --import tsx --test apps/2048/src/lib/faz0/resolver.test.ts  # test-ts
cd apps/2048 && npx eslint . && npm run build                 # lint + build
```
Expected: all pass; 3 resolver tests green.

- [ ] **Step 2: Confirm read-only invariants held**

```bash
git diff --name-only main...HEAD
# Expect ONLY: apps/2048/package.json, package-lock.json,
#   apps/2048/src/lib/faz0/{resolver.ts,resolver.test.ts,evidence.ts},
#   apps/2048/src/app/challenge/page.tsx, apps/2048/src/app/page.tsx
# Expect NO changes under contracts/, supabase/, or any settle/cron path.
git log --oneline main...HEAD   # sanity: no SettlementDemo.sol, no #179 commits
```

- [ ] **Step 3: Set the Vercel-canonical author + push**

```bash
git config user.email '251514042+youngstar-eth@users.noreply.github.com'
git push -u origin "$(git branch --show-current)"
```

- [ ] **Step 4: Open the PR (do NOT merge #179)**

```bash
gh pr create --repo youngstar-eth/SkillOS --base main \
  --title "feat(2048): /challenge — Faz-0 verify-yourself evidence page" \
  --body "Read-only public page surfacing the deployed Faz-0 SettlementDemo (0xD73…B1E, Base Sepolia) honest+fraud loop, with the Δ6 verdict recomputed at render via @skillos/engines and a copy-paste reproduce-it block. Reuses the deployed contract + on-main engines — does NOT merge PR #179, no contract source on main, no production writes. Blockscout (Base Sepolia) links. Closes the public loop: watch → challenge → leaderboard."
```

---

## Self-Review

**Spec coverage:**
- Read-only evidence page (Option 1) → Task 4 ✔
- Story-driven, not raw tx dump → hero + loop cards + scope disclaimer ✔
- Blockscout (Base Sepolia) links, not mainnet → `evidence.ts` `BLOCKSCOUT` + `txUrl`/`addressUrl` ✔
- Honest label "economically-secured optimistic, deterministic-auditable", never "trustless" → `HONEST_LABEL` + hero + disclaimer ✔
- Hybrid (static facts + live verify layer as source of truth) → static `evidence.ts` + live `resolveClaim` recompute + "independently verifiable — here's how" copy ✔
- Reproduce-the-verdict prominent + copy-paste → dedicated bordered section with code snippet + CLI ✔
- Reuse main's `@skillos/engines` + deployed SettlementDemo; no #179 merge; SettlementDemo stays standalone → Tasks 1–4 + scope disclaimer + Task 6 read-only check ✔
- No prod writes, no keys → server-render pure compute only; Task 6 Step 2 enforces ✔
- Link from /watch for loop coherence → Task 5 + explicit out-of-repo NOTE ✔

**Placeholder scan:** all constants are concrete and runtime-verified (golden score 20, seedCommit `0x3d73…16420d`, all 10 tx hashes from the evidence doc). No TBD/TODO. The only conditional is the `@/` alias check (Task 4 note) — resolved with an explicit grep + fallback, not a placeholder.

**Type consistency:** `resolveClaim`/`commitSeed`/`toInputLog` signatures are identical across `resolver.ts`, its test, and `page.tsx`. `Move2048`/`MoveRecord` imported from `@skillos/engines` everywhere. `ResolverVerdict` fields (`replayedScore`, `engineValid`, `fraud`) match every call site.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-31-faz0-challenge-evidence-page.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?** (Execution still requires your explicit go — and a worktree per §3.22; this plan touches the 2048 app which deploys to `2048.skillos.games` only via the normal PR → CI → Vercel path.)
