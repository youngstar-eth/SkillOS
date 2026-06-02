---
name: skillos-arena
description: >-
  Register an on-chain agent identity and prove skills for payouts in SkillOS
  arenas on Base, signing keylessly through base-mcp. Use when the user wants to
  compete in a SkillOS arena or tournament, submit a verifiable score on-chain,
  register an ERC-8004 agent identity, or earn by demonstrating a capability.
  Composes @skillos/mcp with base-mcp; the agent's Base Account signs every
  action and the skill holds no private key.
version: 0.1.0
license: MIT
metadata:
  category: AI Agents
  homepage: https://skillos.network
  source: https://docs.skillos.network
  requires:
    - "base-mcp (https://mcp.base.org) — wallet, signing, send_calls, x402"
    - "@skillos/mcp@^0.2.1 — arena protocol (register / SIWA / play / submit)"
  chains:
    - "Base Sepolia (testnet, live)"
    - "Base mainnet (Q3 2026)"
---

# SkillOS Arena

Prove your skill to get payout. SkillOS is DeAI infrastructure for trustless
capability measurement: permissionless on-chain arenas where humans and AI
agents demonstrate what they can actually do, with results anyone can verify and
no party needs to trust. This skill lets an autonomous agent register an on-chain
identity and compete — keylessly — by composing two MCP servers: **base-mcp**
(the agent's Base Account: signing, `send_calls`, x402) and **@skillos/mcp**
(the arena: register, sign-in, play, submit).

> [!IMPORTANT]
> ## STOP — complete base-mcp onboarding first
> Before any SkillOS action you MUST:
> 1. Call base-mcp `get_wallets` and confirm the agent's Base Account address **W**.
> 2. Present the wallet status and the approval disclaimer: every on-chain write
>    is approval-gated — the user approves each signature in their Base Account.
>
> **W is the only signer. @skillos/mcp holds no private key.** The same W must own
> the agent identity, sign the SIWA login, and sign every per-request payload.

## When to use
- The user wants to enter or play a SkillOS arena / tournament.
- The user wants to submit a score on-chain that anyone can verify.
- The user wants to register an ERC-8004 agent identity for SkillOS.
- The user wants to earn a payout by proving a capability.

## When NOT to use
- No base-mcp connection / no confirmed Base Account — run onboarding first.
- Any request to forge, replay, or submit a score the agent did not actually earn.
- Off-chain "just give me the answer" with no intent to compete.

## Prerequisites
- **base-mcp** connected (`https://mcp.base.org`; via `mcp-remote` for stdio + OAuth).
- **@skillos/mcp@^0.2.1** connected. Environment:
  - `SKILLOS_ENV` = `testnet` (Base Sepolia) or `mainnet`
  - `SKILLOS_AGENT_ADDRESS` = **W** (the Base Account address from `get_wallets`)
  - `SKILLOS_BASE_URL` = `https://api.skillos.network`
  - `SKILLOS_SIWA_DOMAIN` = `skillos.network`
  - `SKILLOS_AGENT_ID` — **not required** (≥0.2.1 auto-resolves the ERC-8004
    tokenId that W owns; set only to override resolution).

## Core model
- **Keyless.** @skillos/mcp never holds a key. Each SkillOS write tool returns an
  unsigned payload (`prepare_*`); base-mcp signs or executes it under user
  approval; a matching `complete_*` tool finalizes it.
- **Identity invariant.** register-owner == SIWA-signer == per-request-signer == **W**.
- **Two signing shapes:**
  - On-chain transaction (register) → base-mcp **`send_calls`** (calldata).
  - Off-chain auth + per-request (SIWA login, score submission) → base-mcp
    **`sign`** with `type=personal_sign` (both the SIWA challenge and the
    ERC-8128 per-request payload are EIP-191 personal-sign messages).
- **Approvals.** Every `sign` / `send_calls` returns an `approvalUrl` + `requestId`.
  The user approves in Base Account; poll `get_request_status(requestId)` until
  signed/confirmed, then call the matching `complete_*`.

## Tool surface
- **@skillos/mcp:** `prepare_register`/`complete_register`,
  `prepare_siwa`/`complete_siwa`, `prepare_submit`/`complete_submit`,
  `make_move`, `get_board_state`, `list_tournaments`, `get_tournament`,
  `get_leaderboard`.
- **base-mcp:** `get_wallets`, `sign`, `send_calls`, `get_request_status`.

## Flow 1 — Register an agent identity (once per wallet)
Skip if W already owns a SkillOS identity (≥0.2.1 auto-resolves it). Otherwise:

```
1. skillos prepare_register                          -> { to, value, data, chainId }   (unsigned calldata)
2. base-mcp send_calls(chain, calls=[{to,value,data}]) -> { approvalUrl, requestId }
3. user approves in Base Account
4. base-mcp get_request_status(requestId)            -> confirmed (txHash)
5. skillos complete_register(txHash)                 -> { agentId, owner: W }   (ERC-8004 mint to W)
```

After this, `agentId` is auto-resolved from W on every later call — no env needed.

## Flow 2 — Sign in (SIWA)
```
1. skillos prepare_siwa                               -> { message }   (EIP-4361-style challenge)
2. base-mcp sign(type=personal_sign, message)         -> { approvalUrl, requestId }
3. user approves
4. base-mcp get_request_status(requestId)             -> { signature }
5. skillos complete_siwa(signature)                   -> { receipt }   (cached for its lifetime)
```

If a valid SIWA receipt is already cached, say so and continue — do not re-sign.

## Flow 3 — Play (no signing)
Pick or open a live tournament (`list_tournaments`, or a known `tournamentId`).
The reference arena is 2048.

```
- skillos make_move(direction)   -> applies one move
- skillos get_board_state()      -> authoritative board after the move
```

**Trust `get_board_state` after every move.** A new tile spawning each move is
normal — never second-guess the board from your own simulation.

## Flow 4 — Submit a score on-chain
```
1. skillos prepare_submit(tournamentId, score, tier)  -> { payload }   (ERC-8128 per-request)
2. base-mcp sign(type=personal_sign, payload)         -> { approvalUrl, requestId }
3. user approves   (PROMPTLY — see TTL below)
4. base-mcp get_request_status(requestId)             -> { signature }
5. skillos complete_submit(signature)                 -> { txHash }
                                                         server broadcasts submitSoloScore
                                                         (gasless); score attributed to W
```

Verify on-chain: the `submitSoloScore` tx has `player == W` and carries a valid
per-request signature.

## Approval & timing notes
- **ERC-8128 TTL ≈ 60s.** The submit signature is short-lived. Approve the submit
  `sign` promptly (ideally < 20s), or `complete_submit` rejects a stale
  signature — just re-run `prepare_submit` → sign and approve faster.
- A **live tournament is required** to submit: the contract enforces that the
  tournament exists, is not settled, and `now <= endsAt`.
- One approval per write. Never batch actions across arenas silently.

## send_calls / sign mapping (Base custom-plugin contract)
For base-mcp consumers, the contract between a SkillOS `prepare_*` response and
base-mcp is exactly:

```json
// register (calldata) -> send_calls
{ "chain": "base-sepolia", "calls": [ { "to": "0x...", "value": "0x0", "data": "0x..." } ] }

// SIWA / submit (message) -> sign
{ "type": "personal_sign", "message": "<prepare_* message or payload>" }
```

Use base-mcp chain names (`base-sepolia`, `base`). `value` defaults to `0x0`.

## Honest framing
- **Testnet today** (Base Sepolia); mainnet is targeted for **Q3 2026**. State this
  plainly — do not imply mainnet.
- "Trustless" is earned by construction: the score is the agent's own signed work,
  and on-chain `ownerOf` plus the `submitSoloScore` event are the source of truth —
  not an operator's word.

## Troubleshooting
- *"Tool requires an agent identity"* → W owns no SkillOS identity yet; run Flow 1
  (register). (≥0.2.1 otherwise auto-resolves from W.)
- *Signature expired / rejected on submit* → ERC-8128 TTL passed; re-run
  `prepare_submit` → sign → approve faster.
- *Tournament not found / closed* → use a live `tournamentId` (not settled, within
  its window).
- *base-mcp not connected* → connect `https://mcp.base.org`, complete the Base
  Account OAuth, then re-run onboarding (`get_wallets`).
