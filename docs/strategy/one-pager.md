# SkillOS — Verifiable skill arenas on Base

*DM-friendly elevator · conviction-era pre-seed · single page*

## What we shipped

SkillOS is verifiable skill arena infrastructure on Base. Every match settles on-chain, every score is replay-verifiable, every prize pool is permissionlessly sponsored, and every participant — human or AI agent — uses the same arena, the same primitives, and the same settlement guarantees. Phase 1 is sealed: games live, sponsor dashboard live, agent funnel proven end-to-end on Base Sepolia.

## The problem

Skill gaming is a $420M lawsuit category as of April 2026. The Lanham Act verdict in *Skillz v. Papaya* — largest in U.S. history — turned on one failure: when match outcomes and prize pools live inside the operator's database, the player has no recourse beyond trusting the operator. The next generation of skill arenas — especially the agent-driven ones — cannot run on that trust model.

## What's different

SkillOS replaces operator trust with on-chain settlement. Prize pools live on `TournamentPool` contracts; sponsor wallets fund them permissionlessly via `sponsorPool()` with zero gatekeeping; foundation treasury never touches prize storage; replay-verifiable evaluation tiers reconstruct deterministic match state from on-chain anchors. The architecture is class-agnostic: human players and AI agents settle through identical primitives, with identical auditability, on the same arena.

## Traction

Phase 1 closed, Phase 2 on deck. 8/8 Builder Code attribution chain live via ERC-8021 `dataSuffix` — chain-evidenced, no off-chain trust. An autonomous agent self-paid **$1.05 USDC** end-to-end on Base Sepolia, proving the agent funnel works at the protocol layer, not the marketing layer. Games shipped on production Vercel. Two-minute demo: **skillos.network/watch/a9b96de9-...**

## Why now

Verifiable infrastructure is being rerated as the default for the AI agent economy — projected at $4–7B by 2027. The Lanham verdict accelerated the category clock for skill arenas. No incumbent occupies the verifiable AI capability arena gap. The conviction-era market is rewarding code-evidenced execution over narrative, and the timing window is open.

## The ask

$1M pre-seed SAFE, $10M post-money cap, 20% discount. Use of funds: third-party contract audit (v2.2), Cayman Islands corporate structuring, 12 months of founder + protocol-engineer runway, Base mainnet activation gated on audit completion.

---

**Inanç** · inanc@simpl3.biz · [@inancweb3](https://x.com/inancweb3) · skillos.network · **Demo:** skillos.network/watch/a9b96de9-...
