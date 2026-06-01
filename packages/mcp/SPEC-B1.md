# SPEC-B1 — base-mcp wallet delegation for @skillos/mcp
Status: CANONICAL (pattern ε). Scope: Phase B1 only.

## Goal
Remove @skillos/mcp's dependency on a self-held SKILLOS_PRIVATE_KEY. The agent's
wallet/identity is the base-mcp Base Account wallet (W). All signing (SIWA, ERC-8128)
and the agent_register tx are produced by base-mcp tools, orchestrated by the host
agent (Hermes). @skillos/mcp becomes a payload-constructor + API client + 2048 engine —
holds no key, signs nothing.

## In scope (B1)
- Refactor agent_register, SIWA auth, ERC-8128 request signing, submit_score
  → prepare_* / complete_* delegation pairs.
- Drop SKILLOS_PRIVATE_KEY; accept W (agent address) as input.
- Keep play tools (get_board_state/make_move) + server-side on-chain attestation
  (STUDIO key) UNCHANGED.
- Publish >=0.2.0 (play tools + this refactor) — single publish, AFTER refactor.

## Out of scope (non-goals)
- x402 pay-to-enter -> Phase B2.
- watch-glue (move-trail -> /watch) -> Phase B3.
- mainnet (Base Sepolia only). Server-side T0 attestation model unchanged.

## Identity invariant
W (from base-mcp get_wallets) is the SINGLE agent identity. The address the ERC-8004
agentId is minted to == the address that signs SIWA == the address that signs ERC-8128.
No second key anywhere.

## Composition contract (host orchestrates base-mcp (+) skillos)
Register (one-time):
- skillos prepare_register(agentURI, owner=W) -> { to, data, value } (IdentityRegistry.register calldata)
- host -> base-mcp send_calls(chain=base-sepolia, calls=[{to,data,value}]) -> approval -> tx
- agentId resolved from mint (chain read/event), owned by W
SIWA (session):
- skillos prepare_siwa(address=W) -> exact SIWA message string (EIP-191 personal_sign payload)
- host -> base-mcp sign(type=personal_sign, data={message}) -> signature
- skillos complete_siwa(address=W, signature) -> verify + cache receipt
Submit (per run):
- skillos prepare_submit(tournamentId, game, score, sessionId?, moves?) -> ERC-8128 payload to sign + context
- host -> base-mcp sign(type=personal_sign, data={message}) -> signature
- skillos complete_submit(signature, ...context) -> POST /v1/agents/scores -> server attests -> txHash
Play (no signing): get_board_state / make_move unchanged.

## Signing-scheme verification gate (CRITICAL)
SIWA + ERC-8128 sign in-process today (buildSiwaSigner, wallet.ts). Implementer MUST
confirm the exact byte-level scheme so base-mcp personal_sign (EIP-191 prefixed:
"\x19Ethereum Signed Message:\n<len>") produces a signature the skillos VERIFIER accepts.
If skillos signs/verifies a raw hash or non-EIP-191 scheme, the external sig will FAIL —
align the verifier to EIP-191 personal_sign (or base-mcp typed_data if EIP-712).
Resolve BEFORE wiring the sign path. Highest implementation risk.

## Config changes
- REMOVE: SKILLOS_PRIVATE_KEY
- ADD: SKILLOS_AGENT_ADDRESS (W); SKILLOS_AGENT_ID now owned by W
- KEEP: SKILLOS_ENV, SKILLOS_BASE_URL, SKILLOS_SIWA_DOMAIN (must match API SIWE_DOMAIN), SKILLOS_RPC_URL

## Acceptance criteria
A real Hermes Agent, configured with base-mcp (mcp.base.org) + skillos (>=0.2.0) and
NO SKILLOS_PRIVATE_KEY, completes: register (base-mcp send_calls) -> SIWA (base-mcp sign)
-> get_board_state/make_move... -> submit (base-mcp sign) -> on-chain submitSoloScore tx
(Blockscout) + get_leaderboard row. Zero private keys held by skillos.

## Verification plan
- typecheck + build green
- offline harness: prepare_* emit correct payloads; complete_* accept a signature from a
  mock signer at address W and the skillos verifier ACCEPTS it (proves EIP-191/712 alignment)
- live: base-mcp on Base Sepolia
