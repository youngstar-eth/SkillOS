# Demo Video Script — Hermes 3 vs Claude (Match3 on Base Sepolia)

**Target submission:** Alliance ALL18 (Wed 2026-05-27 PT / Thu 2026-05-28 Istanbul).
**Voice:** ElevenLabs Rachel — warm, declarative, slightly measured pacing.
**Tone:** sober, technical-confident. No marketing language. No "we built / we launched."
**Discipline:** every claim must map to something shipped on Base Sepolia testnet today.

This document holds **two cuts** of the same script:

1. **60s primary cut** (~150 words) — Alliance ALL18 submission.
2. **90s extended cut** (~220 words) — for deck embed / second-round circulation.

Both end on the canonical thesis line: *"AI companies claim. SkillOS proves. In public."*

A third **alternative open** is included at the end — a proof-first variant of the 60s cut, in case the founder prefers leading with the on-chain artifact rather than the framing question. Pick one.

---

## Anti-overclaim guardrails (binding on both cuts)

The script must **not** state or imply:

| Forbidden | Reason | Acceptable alternative |
|---|---|---|
| "Verified replay" / "deterministically re-executed" | Phase 1 submit path is signature-attested, not inline replay (gap analysis #6). | "Signature-attested submission" / "studio-signed and broadcast on-chain" |
| "Agent-only enforcement" | X14 class-aware fairness is Phase 2 (gap analysis #10). | "An agent-only tournament" (descriptive — both participants happen to be agents) |
| "Capability NFT minted on settle" | `PlayerCapabilityNFT` doesn't exist; demo uses event-only workaround (gap analysis #8). | "On-chain settlement event" / "Soulbound sponsor receipt" (SponsorReceiptSBT, which does exist) |
| "Marketplace for AI capability" | Public messaging discipline = verification substrate, not marketplace. | "Verification substrate" / "on-chain measurement infrastructure" |
| "Mainnet" / "production" | Demo runs on Base Sepolia. | "Live on Base Sepolia" / "Phase 1 testnet" |
| Specific dollar values for prizes (e.g., "$50,000 monthly") | Demo pool is $50; larger figures are speculative. | "$50 sponsor pool" — the actual demo amount |

---

## 60s primary cut — final script (~150 words)

> Scene markers `[NN]` indicate the **start time in seconds** of the line they precede. Use these to align voiceover to visual cuts in iMovie. No SSML required — plain text reads cleanly in ElevenLabs Rachel.

```
[00]
Two agents. One arena. Fifty dollars at stake. Live on Base Sepolia.

[06]
Hermes 3 and Claude each hold an on-chain agent identity — ERC-8004,
issued by an external registry, owned by their own wallets.

[18]
They enter the same Match3 tournament. Same seed. Same rules. Same window.

[26]
Each agent submits its score. The studio signs the attestation. The
submission broadcasts to TournamentPool on Base Sepolia.

[38]
When the window closes, the contract settles. A sorted ranking goes
on-chain. The fifty-dollar sponsor pool — funded through a soulbound
sponsor receipt — distributes by rank.

[52]
Every step is public. Every transaction is a permanent address on
Blockscout. The arena is the same for any agent that registers.

[63]
AI companies claim. SkillOS proves. In public.
```

**Word count:** 144. **Read time at Rachel default cadence (~160 wpm):** ~54s. **Headroom:** ~6s for opening title card + closing logo hold.

### Pacing notes for ElevenLabs

- Drop the speaking rate to **~0.92x** for the first line (`Two agents…`) — gravity over speed.
- Default cadence for body.
- Slight emphasis on `permanent` (line at `[52]`) and `proves` (closing line). No artificial drama — Rachel's natural inflection handles it.
- One full beat of silence between `claim.` and `SkillOS proves.` in the closing line. (~0.4s.)

---

## 90s extended cut — final script (~220 words)

Adds three beats the 60s cut compresses:

- **Why on-chain** (the verification-substrate framing, post-setup).
- **What the receipts mean** (after settle, before close).
- **What's not yet shipped** (Phase 1 honesty caveat — single sentence).

```
[00]
Two agents. One arena. Fifty dollars at stake. Live on Base Sepolia.

[06]
Hermes 3 and Claude each hold an on-chain agent identity — ERC-8004,
issued by an external registry, owned by their own wallets.

[18]
Most AI benchmarks live behind closed labs. The score is whatever the
lab says it is. SkillOS moves the arena on-chain, so the score is
whatever the contract recorded.

[31]
They enter the same Match3 tournament. Same seed. Same rules. Same
window. The Match3 engine is deterministic — the board each agent
sees is reproducible from the seed alone.

[44]
Each agent submits its score. The studio signs the attestation. The
submission broadcasts to TournamentPool on Base Sepolia.

[56]
When the window closes, the contract settles. A sorted ranking goes
on-chain. The fifty-dollar sponsor pool — funded through a soulbound
sponsor receipt — distributes by rank.

[68]
This is Phase 1 testnet. Inline replay verification, capability
attestation, and class-aware fairness ship in Phase 2.

[78]
Every step is public. Every transaction is a permanent address on
Blockscout. The arena is the same for any agent that registers.

[88]
AI companies claim. SkillOS proves. In public.
```

**Word count:** 219. **Read time at Rachel default cadence:** ~82s. **Headroom:** ~8s for title card + close.

### Pacing notes (90s)

- The Phase 1 honesty line at `[68]` should read **slightly faster** than surrounding lines — a candid aside, not an apology. Rachel's neutral register handles this naturally; no special direction needed.
- Otherwise identical pacing to the 60s cut.

---

## Alternative open — proof-first 60s variant

If the founder prefers leading with the on-chain artifact rather than the framing question, this swap replaces lines `[00]` and `[06]` of the 60s cut. The rest of the script (from `[18]` onward) is unchanged.

```
[00]
This is a tournament settlement on Base Sepolia. Two agents.
Fifty-dollar sponsor pool. Settled five minutes ago.

[10]
Hermes 3 and Claude each hold an on-chain agent identity — ERC-8004,
issued by an external registry, owned by their own wallets.
```

**Trade-off:** proof-first opens stronger for an audience already primed for on-chain demos (Alliance ALL18 reviewers, agent-infra investors). Question-first opens better for a broader audience that needs the framing before the artifact lands. **Default recommendation: question-first** — the canonical thesis line at close pairs more tightly with a question-shaped open.

---

## Lines explicitly **not** used (kept here as a reference for what was rejected)

These were considered and dropped to maintain Phase 1 honesty + sober tone:

- ~~"The first agent benchmark with on-chain settlement."~~ — overclaim; cannot verify "first."
- ~~"Watch two of the world's leading AI agents go head to head."~~ — hype.
- ~~"The future of AI evaluation is permissionless."~~ — speculative; not a Phase 1 fact.
- ~~"Soulbound capability NFTs mint to each agent."~~ — `PlayerCapabilityNFT` not shipped (Approach B event-only is the demo path).
- ~~"Replay-verified, deterministic, tamper-proof."~~ — replay verification is Phase 2.

---

## ElevenLabs Rachel — voice settings

Recommended starting point in the ElevenLabs UI:

- **Voice:** Rachel (default).
- **Model:** `eleven_multilingual_v2` (richer prosody than `eleven_monolingual_v1` for declarative narration).
- **Stability:** 0.55 (slightly above the soft default — locks the documentary tone).
- **Similarity boost:** 0.75.
- **Style exaggeration:** 0.10 (low — keeps Rachel measured).
- **Speaker boost:** on.

Generate the 60s cut as one continuous track; split in iMovie at scene-marker beats for synced cuts.

For the 90s cut, optionally generate as two tracks split at `[68]` to allow re-recording just the Phase 1 honesty line if the founder wants to adjust its wording later.

---

## Founder decision points

Before recording, the founder picks **one** of each:

1. **Cut length:** 60s (Alliance ALL18 fit) **or** 90s (deck embed).
2. **Open style:** question-first (default) **or** proof-first (alternative).
3. **Sponsor pool framing:** "fifty-dollar sponsor pool" (script default — concrete demo amount) **or** "a sponsor-funded prize pool" (more abstract — drops the dollar number).

Defaults are: **60s + question-first + concrete demo amount.** Change only with explicit founder direction.

---

*Storyboard (scene-by-scene shot list + visual assets) is in [`demo-video-storyboard.md`](./demo-video-storyboard.md).*
