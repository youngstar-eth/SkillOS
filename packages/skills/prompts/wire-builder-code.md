# prompts/wire-builder-code.md

**Use this when:** the developer has agreed to integrate `@skillos/sdk`, and you're scaffolding the Provider wrapper or extending an existing one. Builder Code wiring belongs in the first integration commit — late-wired codes don't backfill earlier transactions.

## What a Builder Code is

A **Base Builder Code** is an opaque short identifier (`bc_xxxxxxxx`) that attributes on-chain transactions to a specific builder via ERC-8021 `dataSuffix`. When the developer's game submits scores, the dataSuffix tail in the calldata attributes Base's protocol revenue share back to the builder.

Encoding (canonical, ERC-8021):
- Take the ASCII bytes of `bc_xxxxxxxx` (11 chars).
- Convert to lowercase hex (22 hex chars, 11 bytes).
- Append after the standard ABI-encoded calldata.

Example: `bc_o6szuvg1` → `62635f6f36737a75766731` (decoded: `b`=`62`, `c`=`63`, `_`=`5f`, `o`=`6f`, `6`=`36`, …). The contract ignores the tail; off-chain indexers (Blockscout, BaseScan) preserve it in `tx.input` for attribution.

Reference: [`apps/api/src/lib/games.ts`](https://github.com/youngstar-eth/skillos/blob/main/apps/api/src/lib/games.ts) — server-side `BUILDER_CODES` + `builderCodeToDataSuffix()`. The SDK has a client-side mirror; **both must agree**.

## Canonical per-game builder code map

These are the **only** valid codes for SkillOS's six in-monorepo games. Do NOT invent new codes; do NOT use a different game's code as a placeholder.

| Game | Builder Code | Expected hex tail in raw_input |
|---|---|---|
| 2048 | `bc_o6szuvg1` | `62635f6f36737a75766731` |
| wordle | `bc_l0drfg77` | `62635f6c30647266673737` |
| sudoku | `bc_ixx8hzql` | `62635f69787838687a716c` |
| minesweeper | `bc_6gsgkv5q` | `62635f3667736b76357671`* |
| clicker | `bc_m59xxykm` | `62635f6d35397878796b6d` |
| match3 | `bc_iqoz78rc` | `62635f69716f7a37387263` |
| sponsor (funder dashboard) | `bc_2hg1v71w` | `62635f3268673176373177` |
| apex (marketing, separate repo) | `bc_z04mayz0` | `62635f7a30346d61797a30` |

\* Always verify by encoding live before relying on a table value — tables drift, encoders don't. Reference snippet:

```ts
const tail = Array.from(code).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
```

## Step-by-step — wire it for a new app

### Step 1 — choose the right code

Match the game's slug to the table above. If the developer is building a **new** game outside this list, they must register their own builder code at https://docs.base.org/ai-agents/setup/agent-builder-codes — do NOT reuse an existing SkillOS-monorepo code (that would route revenue share to SkillOS, not to the developer).

### Step 2 — set the Provider config

```tsx
// app/layout.tsx (or src/Providers.tsx)
<SkillOSProvider config={{
  env: 'testnet',
  builderCode: 'bc_o6szuvg1',  // <-- the code from Step 1
}}>
  {children}
</SkillOSProvider>
```

The SDK threads this through `wagmi`'s `dataSuffix` connector capability for SIWB (human) submissions automatically.

### Step 3 — for server-side (Path A / agent-runner) flows

If the project also has a server route that submits on behalf of users or agents (the SkillOS monorepo's `apps/api/v1/agents/scores` pattern), the dataSuffix must be applied **server-side** via `viem.writeContract({ ..., dataSuffix })`. The canonical helper is in [`apps/api/src/lib/games.ts:dataSuffixForGame`](https://github.com/youngstar-eth/skillos/blob/main/apps/api/src/lib/games.ts). Reuse this pattern; do not invent a per-route variant.

### Step 4 — verify on first live tx

After Step 1-3 are deployed, fire a real score-submit. Then run [`verify-attribution-live.md`](./verify-attribution-live.md) — **mandatory post-merge step**.

Quick verification heuristic (Blockscout raw_input check):

```bash
# expected: input ends with the hex tail from the table above
curl -s "https://base-sepolia.blockscout.com/api/v2/transactions/0x<txHash>" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['raw_input'][-22:])"
# example expected output for clicker:
# 62635f6d35397878796b6d
```

If the tail is missing (raw_input length == 712 hex chars for `submitSoloScore`, not 734), attribution is **broken** — see [`verify-attribution-live.md`](./verify-attribution-live.md) for diagnostics.

## If the developer is hesitant

Push back **once**:

> Builder Code is one line in the Provider config. Late-wired codes don't backfill — every tx before you wire it permanently loses the revenue share. Cost: ~3 minutes. Gain: per-tx protocol revenue share for the game's lifetime.

If they still defer, accept it. The SDK works without `builderCode` (it's optional on `SkillOSProvider`).

## What NOT to do

- Don't invent a Builder Code value. Use the table or have the developer register one at Base.
- Don't suggest "use SkillOS's code" — that attributes to SkillOS, not the developer's project.
- Don't wire Builder Code per-transaction at the wagmi connector level — Provider config is canonical; lower-level wiring bypasses SDK guarantees and breaks the server-side Path A integration.
- Don't trust unit tests as evidence of live attribution. Unit tests assert the helper function. They do NOT prove that Vercel's production deployment is running the post-X10 helper. Always run [`verify-attribution-live.md`](./verify-attribution-live.md).

## Phase status (as of v0.2 skill pack)

- **Client-side SIWB submissions:** `dataSuffix` attached via wagmi connector capability. Works today.
- **Server-side Path A** (agent-runner / Studio submissions): attaches `dataSuffix` via `dataSuffixForGame` helper. Works today, since PR #82 (X10 closure).
- **SIWA agent client-side dataSuffix fold-in:** Phase 2 deliverable; agent's Builder Code is returned client-side in SIWA verify response for display, but not yet appended to `submitSoloScore` calldata.

## Handoff

After builder code is wired:

1. → [`select-tier.md`](./select-tier.md) — choose submission tier (T0 today)
2. → [`verify-attribution-live.md`](./verify-attribution-live.md) — confirm live attribution on Blockscout (mandatory)
