# X15 Wave 2 — Sprint Retrospective

**Sprint:** X15 — Agent x402 retry payments (Wave 2 close)
**Timeline:** May 15, 2026 (Wave 1 close → Wave 2 kickoff → Wave 2 close, same day)
**Status:** Closed. All sub-tasks shipped; ADR 0003 verified end-state appended.
**ADR:** [`docs/adr/0003-agent-x402-retry-payments.md`](../adr/0003-agent-x402-retry-payments.md)
**Prior wave:** [Wave 1 retrospective](./X15-wave-1-retrospective.md)

---

## Sub-tasks shipped (Wave 2)

| Sub-task | What | Artifact | Merge SHA |
|---|---|---|---|
| **X15.6** | Agent-side x402 client backend orchestration. `paymentMiddleware` route revert + new `apps/api/src/lib/x402-client.ts` (EIP-3009 signer + facilitator round-trip) + background-worker handler returning 202 + `runId`. | `apps/api/src/lib/x402-client.ts`, `apps/api/src/routes/agents-matches.ts`, schemas + tests | `a6517ac` (PR #94) |
| **X15.5 frontend rename** | Apex `chargeRetryFee` → `chargeEntryFee` lexicon sync follow-up that was open at Wave 1 close. | apex repo | merged |
| **X15.7** | E2E verification: 3 sequential paid retries against tournament `0xe7f14e22…`. SC1 implicitly covered by founder pre-test; SC2/SC3 covered by Run 2 + Run 3 retry; SC7 dataSuffix attribution verified on both anchored submits. | Production traces only (no code change) | n/a (verification sprint) |
| **X15.9 finalize** | This retrospective + ADR verified end-state + Patterns #18–22 + pitch summary + `env.example`. | this PR | (pending) |

---

## X15.7 canonical demo

**runId:** `0c1b0e88-39c2-42a4-930b-fdc6da52795f`
**Tweet URL:** <https://skillos.network/watch/0c1b0e88-39c2-42a4-930b-fdc6da52795f>
**Final score:** 96 (24 moves; corner-pinning strategy clearly articulated in `duel_moves.reasoning`)
**Settle tx (Blockscout):** <https://base-sepolia.blockscout.com/tx/0xf649727b0681abee9c6a7913ab02c6f0321857b3bc37125c7ef482ef8cdbaa18>

### Three tx hashes per anchored run

| Tx | Run 2 (`e73d88c7-…`) | Run 3 retry (`0c1b0e88-…`, canonical) |
|---|---|---|
| `x402_tx_hash` (USDC → receiver) | `0xbd56825f…` | `0x4e57d7fe…` |
| `tx_hash` (`chargeRetryFee`) | `0xc03a1210…` | `0x5d6918ba…` (block 41551888) |
| `on_chain_tx_hash` (`submitSoloScore`, dataSuffix) | `0x29f642da…` | `0xf649727b…` |
| Calldata length (hex) | 734 | 734 |
| Last-22 ASCII (Builder Code) | `bc_o6szuvg1` | `bc_o6szuvg1` |

### Drain reconciliation

| Wallet | Pre-X15.7 | Post-X15.7 | Δ |
|---|---|---|---|
| Agent USDC (`0xf481b744…`) | $18.95 | $13.80 | −$5.15 |
| x402 receiver USDC (`0xb9b141b6…`) | $21.05 | $24.20 | +$3.15 (3 × $1.05) |
| TournamentPool fee accumulator | — | — | +$2.00 (Run 2 + Run 3 retry × $1.00 each) |
| Agent nonce | 0 | 3 | +3 (approve, chargeRetryFee × 2) |

Math: `3 × $1.05 (x402) + 2 × $1.00 (chargeRetryFee) = $5.15` matches the agent drain exactly. The "missing" $1.00 on the contract side is Run 1's `chargeRetryFee` that never landed (race condition; row `needs_manual_review=true`); the $1.05 x402 from that run is in the receiver wallet and contributes to the +$3.15 line.

### Lifecycle states observed (3 X15.7 retries + 1 pre-test)

- **Paid retry happy path** (`pending → x402_settled → anchored`) — 2 runs (Run 2, Run 3 retry).
- **Free-first slot** (`pending → x402_settled → skipped`, `reason='free_first_slot'`) — 1 run (founder pre-test).
- **Settled-but-not-anchored** (`pending → x402_settled → failed`, `needs_manual_review=true`) — 1 run (Run 1; cross-RPC race per Pattern #21).
- **x402-failed-pre-settle** (`pending → failed`, `error_code='X402_SETTLE_FAILED'`) — 1 transient first-attempt (Run 3 first attempt; recovered by retry per Pattern #22).

All four observed transitions match ADR 0003 D9 enumeration exactly.

---

## Surfaced issues (Wave 2)

1. **Pattern #18** — `getAgentAccount()` latent dependency. X15.3 introduced it on a rare path; X15.6 made it unconditional and surfaced missing `AGENT_PRIVATE_KEY` env in prod.
2. **Pattern #19** — Env paste ≠ env wired. Discipline: post-`vercel env add` verify via `vercel env ls production | grep <KEY>` is canonical.
3. **Pattern #20** — Generated secret save discipline. Foundry keystore / password manager / encrypted file. Never rely on terminal scrollback.
4. **Pattern #21** — Cross-RPC race (X15.7 Run 1). Approve confirmed via public RPC, `chargeRetryFee` simulation against Alchemy saw stale allowance. Fire-once per agent. Fix candidate: wait 2-3 blocks or unify RPC endpoints.
5. **Pattern #22** — x402 facilitator transient `invalid_exact_evm_transaction_failed` (X15.7 Run 3a). Identical retry 3 minutes later anchored. Fix candidate: 1 retry-with-backoff inside `settleX402Payment` with fresh nonce.

All 5 patterns locked to [`.claude/memory/feedback_patterns.md`](../../.claude/memory/feedback_patterns.md).

---

## Open follow-ups (non-blocking; not in this sprint's scope)

- **PaymentStatePanel stale copy.** Apex `PaymentStatePanel` shows subtext `"Match in progress — entry fee anchored on-chain."` even when match status has transitioned to `ENDED`. Cosmetic only; backend lifecycle is correct. ~5-minute fix in apex repo (X15.5 v3 PR or follow-on). Not bundled in X15.9 finalize per separation of concerns.
- **Pattern #21 + #22 fix candidates** — orchestrator-side retries / RPC unification in `apps/api/src/lib/duel/charge-retry-fee.ts` and `apps/api/src/lib/x402-client.ts`. Optional hardening; current `needs_manual_review` ledger pattern is operator-recoverable as designed.

---

## Wave 2 metrics

- **PRs merged:** 4 (X15.6 backend, X15.5 frontend rename, X15.7 verification, X15.9 finalize)
- **Production incidents:** 0 unrecoverable; 1 `needs_manual_review` row by-design
- **Testnet USDC drain:** $5.15 (intentional; matches predicted per-retry math)
- **Foundry test count:** unchanged from Wave 1 (no contract changes in Wave 2)
- **Patterns added to project memory:** 5 (#18–#22)
- **ADR amendments:** 1 (Verified end-state section, May 15, 2026)
- **Canonical public demo:** 1 (runId `0c1b0e88-…`, settle tx `0xf649727b…`)

---

## Sprint-total metrics (Wave 1 + Wave 2)

- **Sub-tasks shipped:** 8 (X15.3, 4, 5, 5-rename, 6, 7, 8, 9-finalize)
- **PRs merged:** 8 (4 per wave)
- **Patterns added:** 7 (#16–#22)
- **ADR amendments:** 2 (D11 dual-state NOTE in Wave 1, Verified end-state in Wave 2)
- **Production incidents:** 0 unrecoverable across both waves
- **Mainnet readiness:** code complete for Phase 2; gates remaining = X12 audit + X13 Cayman counsel (per ADR D10)

---

## References

- **Sprint scope doc:** [`X15-agent-x402-retry-payments.md`](./X15-agent-x402-retry-payments.md)
- **Wave 1 retrospective:** [`X15-wave-1-retrospective.md`](./X15-wave-1-retrospective.md)
- **ADR:** [`docs/adr/0003-agent-x402-retry-payments.md`](../adr/0003-agent-x402-retry-payments.md)
- **Pattern memory:** [`.claude/memory/feedback_patterns.md`](../../.claude/memory/feedback_patterns.md)
- **Pitch summary:** [`docs/pitch/X15-summary.md`](../pitch/X15-summary.md)
- **Auto-memory for Wave 2:** `project_x15_7_e2e_verified`, `project_x15_chargeretryfee_first_paid_retry_race`, `project_x15_6_agent_private_key_vercel_gap` (user-level auto-memory)
