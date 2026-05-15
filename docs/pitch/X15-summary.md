# X15 — Agent x402 paid retries on SkillOS

**Status:** Phase 1 testnet, shipped May 15, 2026. Mainnet activation gated on Phase 2 audit cycle.
**Canonical demo:** <https://skillos.network/watch/0c1b0e88-39c2-42a4-930b-fdc6da52795f>
**Settle proof (Base Sepolia):** <https://base-sepolia.blockscout.com/tx/0xf649727b0681abee9c6a7913ab02c6f0321857b3bc37125c7ef482ef8cdbaa18>

---

## One-paragraph version (for partner outreach + investor updates)

SkillOS shipped end-to-end agent-paid retries on a live 2048 tournament on Base Sepolia. An autonomous Claude-driven agent paid its own way through the protocol: it signed an EIP-3009 x402 invoice for $1.05 USDC (settled by the x402.org facilitator), called `chargeRetryFee` for an additional $1.00 USDC on-chain (`msg.sender == player` constraint preserved, so the agent self-pays — no studio middleware), played a 24-move match, and submitted its score on-chain with full `dataSuffix` Builder Code attribution (`bc_o6szuvg1`). The entire flow runs against a non-custodial Solidity contract; no platform escrow, no permissioned write paths, no human in the settlement loop. The demo run (final score 96) and three Base Sepolia transactions are publicly verifiable. SDK-ready for "bring your own agent" — Phase 2 mainnet activation is audit-gated and follows the published roadmap.

---

## Three-paragraph version (for blog post / longer pitch)

### The shipped surface

SkillOS X15 closed the loop on agent-paid retries. An autonomous Claude-driven agent now plays solo 2048 tournaments on the SkillOS protocol while paying its own way through the protocol's two-meter economic surface: an off-chain **x402 EIP-3009 settlement** ($1.05 USDC, via the x402.org testnet facilitator) for the platform's retry meter, plus an on-chain **`chargeRetryFee` payment** ($1.00 USDC, agent self-pays under the contract's `msg.sender == player` constraint) for the tournament's fee accumulator. The agent's score then anchors via `submitSoloScore` with ERC-8021 `dataSuffix` Builder Code attribution (734-hex calldata with trailing `bc_o6szuvg1` ASCII tail), preserving the same on-chain attribution surface that human players get through wagmi's `dataSuffix` capability. The full lifecycle — agent identity, payment, score attestation, and Builder Code attribution — is non-custodial: a permissionless Solidity contract is the source of truth, and the platform never holds the agent's funds in escrow.

### Why this matters now

The 2026 agent ecosystem has converged on three primitives: **agentic identity** (an autonomous wallet that proves its own actions on-chain), **agent-native commerce** (a payment rail that lets agents settle their own invoices without a human in the loop), and **attributable execution** (machine-readable provenance for every on-chain action). SkillOS X15 lands all three on the same flow. The agent's identity is its EOA; the commerce is x402 EIP-3009 + the contract's own `chargeRetryFee`; the attribution is ERC-8021 `dataSuffix`. Anthropic's May 2026 push around the Agent SDK, Managed Agents, Skills, and MCP-server-as-tool framing assumes exactly this kind of substrate is becoming a reality — SkillOS is one of the production demos. Builder Codes (`bc_o6szuvg1` for 2048, sibling codes for each game app) compose with that substrate: an agent built on the Anthropic stack can take its identity, its wallet, its toolchain, and its accountable execution all the way through a public, auditable game economy.

### What's next

Phase 1 testnet is shipped and demo-verifiable. The Wave 2 sprint that closed this work produced a public canonical demo, a fully-reconciled $5.15 testnet drain across three sequential agent retries, four merged PRs, and zero unrecoverable production state — plus five new operational patterns codified in pattern memory for the next surface that touches the same primitives. The SDK is ready for early third-party agent integrations: bring your own agent, sign the EIP-3009 invoice, anchor your score with your own Builder Code. Phase 2 mainnet activation is audit-gated and follows the published roadmap; the ADR (`docs/adr/0003-agent-x402-retry-payments.md`) documents the mainnet readiness dependencies and the operator-side reconciliation surface explicitly. SkillOS treats public framing as a commitment device, not a teaser — what's shipped, ships; what's roadmap, stays roadmap until the audit gates clear.

---

## Receipts

- **Code:** [`apps/api/src/lib/x402-client.ts`](../../apps/api/src/lib/x402-client.ts), [`apps/api/src/routes/agents-matches.ts`](../../apps/api/src/routes/agents-matches.ts), [`apps/api/src/lib/duel/charge-retry-fee.ts`](../../apps/api/src/lib/duel/charge-retry-fee.ts)
- **Contract:** TournamentPool v2.1, `0x52049b812780134d2F69D6c20C2ef881D49702da` (Base Sepolia)
- **Demo runId:** `0c1b0e88-39c2-42a4-930b-fdc6da52795f` (final score 96, 24 moves)
- **Settle tx:** `0xf649727b0681abee9c6a7913ab02c6f0321857b3bc37125c7ef482ef8cdbaa18`
- **ADR (locked architecture, May 15, 2026 verified end-state):** [`docs/adr/0003-agent-x402-retry-payments.md`](../adr/0003-agent-x402-retry-payments.md)
- **Wave retrospectives:** [Wave 1](../sprints/X15-wave-1-retrospective.md), [Wave 2](../sprints/X15-wave-2-retrospective.md)
