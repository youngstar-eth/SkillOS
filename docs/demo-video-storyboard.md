# Demo Video Storyboard — Hermes 3 vs Claude (Match3 on Base Sepolia)

**Companion to:** [`demo-video-script.md`](./demo-video-script.md).
**Composition tool:** iMovie (founder-default per Strategic Memory v1.10).
**Voiceover:** ElevenLabs Rachel (settings in script doc).

This doc is the bridge between voiceover and visual cuts. Each scene specifies:
- The voiceover line(s) it covers (timestamp from `demo-video-script.md`).
- Visual asset(s) needed (with file path or capture source).
- Duration / transition notes.

Two scene tables — one per cut. Asset checklist at the end.

---

## Visual grammar (binding on both cuts)

- **Cuts are sharp.** No dissolves, no Ken Burns pan unless the underlying screenshot is too small to fill frame at 1080p — and then only at the slowest pan rate iMovie offers.
- **No motion graphics overlays** except for **address labels** (a small fixed-position lower-third bar showing the 0x address being highlighted, monospace, semitransparent black background, 70% opacity).
- **Color discipline.** Use the SkillOS apex palette: white background for title/close, dark canvas for Blockscout/leaderboard captures (which already render dark). Avoid the "VC pitch glow" gradient look.
- **No countdown timers, no progress bars.** The settle moment lands on the cut itself, not on UI theatrics.
- **Title card minimalism.** Open title = the SkillOS wordmark on white, held for ~1.5s. Close title = the thesis line as a still card (white text, dark background), held for ~2s after voiceover ends.

---

## 60s primary cut — scene table (8 scenes)

| # | t-start | t-end | Voiceover line (from script) | Primary visual | Asset path / source | Notes |
|---|---|---|---|---|---|---|
| **S1** | 00 | 06 | *"Two agents. One arena. Fifty dollars at stake. Live on Base Sepolia."* | Title card → cut to wide shot of Match3 board (idle, pre-tournament state). | Title: generated in iMovie. Match3 board: live capture from `apps/match3/src/app/tournament/[id]/page.tsx` at tournament start state. | Title card holds ~1.5s, board fills the remaining ~4.5s. |
| **S2** | 06 | 18 | *"Hermes 3 and Claude each hold an on-chain agent identity — ERC-8004, issued by an external registry, owned by their own wallets."* | Split-screen: left = Hermes agent profile, right = Claude agent profile. Both show ERC-8004 `agentId` + wallet address + Basescan link. | `apps/match3/src/app/agent/[address]/page.tsx` (or equivalent agent profile route) for each agent. Capture at ~2x browser zoom for legibility. | Lower-third bar fades in showing the external registry contract address (`0x8004A818…BD9e`) for 2s. |
| **S3** | 18 | 26 | *"They enter the same Match3 tournament. Same seed. Same rules. Same window."* | Tournament detail page: title, prize pool, window, two-row participant list. | `apps/match3/src/app/tournament/[id]/page.tsx` — tournament header + participants. | The tournament header should show the on-chain tournament ID (truncated, monospace) as a label. |
| **S4** | 26 | 38 | *"Each agent submits its score. The studio signs the attestation. The submission broadcasts to TournamentPool on Base Sepolia."* | Two Blockscout transaction pages cross-cut: `submitSoloScore` tx for Hermes, then for Claude. Both txs show input data + `ScoreSubmitted` or `SoloScoreSubmitted` event. | Blockscout: `https://sepolia.basescan.org/tx/<hash>` for each agent's submit tx. Use the actual broadcast hashes from `scripts/output/hermes-demo-{ts}.json`. | Cross-cut on the voiceover word "Claude" (~31s). Each tx page held ~5s. |
| **S5** | 38 | 52 | *"When the window closes, the contract settles. A sorted ranking goes on-chain. The fifty-dollar sponsor pool — funded through a soulbound sponsor receipt — distributes by rank."* | Sequence (sub-cuts every ~3s): (a) `settle` tx page on Blockscout with `TournamentSettled` event expanded, (b) `sortedRanking` parameter highlighted, (c) `PoolSponsored` event from the sponsorship pre-fund tx, (d) `SponsorReceiptSBT` tokenURI view. | (a)+(b): settle tx from artifact JSON. (c): sponsor tx from artifact JSON. (d): `https://sepolia.basescan.org/address/0xCCC183c72D666A16E03bf38E8c2DFa8a68b2e768` → token #N from `receiptTokenId`. | This is the densest scene — keep visual sub-cuts crisp; let voiceover lead the rhythm. |
| **S6** | 52 | 63 | *"Every step is public. Every transaction is a permanent address on Blockscout. The arena is the same for any agent that registers."* | Final leaderboard state — both agents listed with final scores + final rank + prize received. | `apps/match3/src/app/leaderboard/page.tsx` filtered to the demo tournament, OR the tournament detail page after settle (post-settle UI state). | Hold the leaderboard for the entire line; the visual stillness reinforces "public, permanent." |
| **S7** | 63 | 67 | *"AI companies claim. SkillOS proves."* | Thesis card — first half. White text on dark background. Monospace for "claim" → "proves" wordplay. | Designed in iMovie or pre-rendered. | Cut hard from leaderboard to card on word "claim." Hold ~2s. |
| **S8** | 67 | 70 | *"In public."* | Thesis card — second half. Same card, "In public." added below. Then dissolve to SkillOS wordmark. | Same iMovie title. | Final ~3s sit. Audio: ~0.5s silence after voiceover before the cut to wordmark. |

**Total runtime:** ~70s (allowing ~10s of breathing room beyond the 60s voiceover for opening title + closing hold).

---

## 90s extended cut — scene table (12 scenes)

Diff from 60s: inserts **S3b** (verification-substrate framing), **S5b** (seed determinism reinforcement on the deterministic engine), and **S6b** (Phase 1 honesty caveat — single beat). Other scenes shift in timing to accommodate.

| # | t-start | t-end | Voiceover line (from script) | Primary visual | Asset path / source | Notes |
|---|---|---|---|---|---|---|
| **S1** | 00 | 06 | *"Two agents. One arena. Fifty dollars at stake. Live on Base Sepolia."* | Title card → Match3 idle board. | (same as 60s S1) | |
| **S2** | 06 | 18 | *"Hermes 3 and Claude each hold an on-chain agent identity — ERC-8004 …"* | Split-screen agent profiles. | (same as 60s S2) | |
| **S3b** | 18 | 31 | *"Most AI benchmarks live behind closed labs. The score is whatever the lab says it is. SkillOS moves the arena on-chain, so the score is whatever the contract recorded."* | Wide diagram from Day 4 canonical set — the *"on-chain verification substrate"* diagram (cross-cuts to a "closed lab" stock visual at the line on closed labs). | Day 4 diagram folder: `docs/diagrams/day4/` (or wherever the 12 canonical diagrams live — confirm path before recording). Closed-lab visual: founder-supplied stock or a stylized "black box" iMovie shape. | This is the **substrate thesis** beat. Visual should not feel like marketing — keep the diagram clean, technical. |
| **S3** | 31 | 44 | *"They enter the same Match3 tournament. Same seed. Same rules. Same window. The Match3 engine is deterministic — the board each agent sees is reproducible from the seed alone."* | Tournament detail page + a brief inset showing the seed → board derivation (one frame: seed hex → board grid). | Tournament page + a small static diagram of `apps/match3/src/lib/match3/engine.ts` seed flow (founder-rendered or pulled from Day 4 set if present). | The seed determinism inset is the visual proof the line claims — keep it ~3s. |
| **S4** | 44 | 56 | *"Each agent submits its score. The studio signs the attestation. The submission broadcasts to TournamentPool on Base Sepolia."* | Two Blockscout submit txs cross-cut. | (same as 60s S4) | |
| **S5** | 56 | 68 | *"When the window closes, the contract settles. A sorted ranking goes on-chain. The fifty-dollar sponsor pool — funded through a soulbound sponsor receipt — distributes by rank."* | Settle tx + sortedRanking + sponsor receipt sequence. | (same as 60s S5) | |
| **S6b** | 68 | 78 | *"This is Phase 1 testnet. Inline replay verification, capability attestation, and class-aware fairness ship in Phase 2."* | Phase roadmap card — Phase 1 column highlighted, Phase 2 column dimmed. Pulled from Day 4 phase diagram. | Day 4 phase roadmap diagram (`docs/diagrams/day4/phase-roadmap.png` or similar — confirm exact filename before recording). | The honesty beat. Visual is sober — no animation, no glow. The dimmed-Phase-2 column reads as "not yet shipped" without needing the words. |
| **S6** | 78 | 88 | *"Every step is public. Every transaction is a permanent address on Blockscout. The arena is the same for any agent that registers."* | Final leaderboard. | (same as 60s S6) | |
| **S7** | 88 | 92 | *"AI companies claim. SkillOS proves."* | Thesis card first half. | (same as 60s S7) | |
| **S8** | 92 | 95 | *"In public."* | Thesis card second half → wordmark. | (same as 60s S8) | |

**Total runtime:** ~95s (~5s of headroom).

---

## Alternative open — proof-first 60s scene swap

Replaces scenes **S1** and **S2** of the 60s cut. **S3** onward is unchanged.

| # | t-start | t-end | Voiceover line | Primary visual | Asset path / source | Notes |
|---|---|---|---|---|---|---|
| **S1-alt** | 00 | 10 | *"This is a tournament settlement on Base Sepolia. Two agents. Fifty-dollar sponsor pool. Settled five minutes ago."* | Open directly on the `TournamentSettled` Blockscout tx page, with `totalDistributed` value highlighted. | Settle tx from artifact JSON. | The "settled five minutes ago" timestamp must be live-true on the day of submission — re-shoot the artifact if more than 24h old. |
| **S2-alt** | 10 | 18 | *"Hermes 3 and Claude each hold an on-chain agent identity — ERC-8004, issued by an external registry, owned by their own wallets."* | Split-screen agent profiles (same as default S2). | (same as default S2) | Slightly shorter than default S2 — voiceover line ends at 18s. |

**Trade-off recap** (also in script doc): proof-first lands harder for primed audiences. Default to question-first.

---

## Visual assets — checklist

Tick each before recording the voiceover so iMovie composition has all inputs ready:

### Live captures (from the demo run itself)

- [ ] **Match3 tournament page (pre-tournament idle state)** — `apps/match3/src/app/tournament/<demoTournamentId>/page.tsx`. Browser screencap, ~2x zoom, dark theme.
- [ ] **Match3 tournament page (post-settle state with final ranking)** — same route, after settle. (Used in S3/S6 of 60s, S3/S6 of 90s.)
- [ ] **Agent profile — Hermes** — `apps/match3/src/app/agent/<hermesAddress>/page.tsx`. Confirm route exists in match3 app; if not, use the generic profile route (`apps/match3/src/app/profile/[address]/page.tsx`).
- [ ] **Agent profile — Claude** — same route, Claude's address.
- [ ] **Leaderboard page** — `apps/match3/src/app/leaderboard/page.tsx` filtered to the demo tournament.

### Blockscout / Basescan captures (from `scripts/output/hermes-demo-{ts}.json`)

> Use the artifact JSON from running `scripts/create-hermes-vs-claude-demo.ts --broadcast`. Each tx hash is a captured screenshot at `https://sepolia.basescan.org/tx/<hash>`.

- [ ] **Hermes `agent_register` tx** — `txHashes.register.hermes`. Capture with the `Registered` event expanded showing `agentId` + `owner`.
- [ ] **Claude `agent_register` tx** — `txHashes.register.claude`.
- [ ] **`createTournament` tx** — `txHashes.create`. Capture with `TournamentCreated` event expanded.
- [ ] **`sponsorPool` tx** — `txHashes.sponsor`. Capture with `PoolSponsored` event expanded (`receiptTokenId` visible).
- [ ] **Hermes submit tx** — Hermes's `submitSoloScore`/`submitScore` broadcast tx (captured separately during the actual gameplay run; not in the orchestration artifact).
- [ ] **Claude submit tx** — same for Claude.
- [ ] **`settle` tx** — `txHashes.settle`. Capture with `TournamentSettled` event expanded + `sortedRanking` input data visible.
- [ ] **SponsorReceiptSBT token view** — `https://sepolia.basescan.org/address/0xCCC183c72D666A16E03bf38E8c2DFa8a68b2e768` → "Inventory" tab → demo tournament's `receiptTokenId`. Capture the token detail page (tokenURI metadata).
- [ ] **External ERC-8004 IdentityRegistry overview** — `https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e`. One static capture of the contract overview, used in S2's lower-third reference.

### Day 4 canonical diagrams (cutaway material, 90s cut)

> Source: 12 canonical diagrams from Day 4. **Confirm exact filenames before recording** — the canonical set lives in claude.ai project memory, not on disk yet, so the founder needs to export them to `docs/diagrams/day4/` (or wherever) and update this list with real paths.

- [ ] **"Verification substrate" overview diagram** — used in S3b (90s cut).
- [ ] **Phase 1 / Phase 2 / Phase 3 roadmap** — used in S6b (90s cut). Phase 1 column highlighted; Phases 2-3 dimmed.
- [ ] *(optional)* **ERC-8004 identity flow diagram** — alternate cutaway for S2 if the agent profile screencaps don't read cleanly at video resolution.
- [ ] *(optional)* **Sponsor pool → SponsorReceiptSBT mint flow** — alternate cutaway for S5 if the Blockscout sequence feels too dense.

### Title / closing cards (designed in iMovie)

- [ ] **Open title** — SkillOS wordmark on white background, 1.5s.
- [ ] **Thesis card (first half)** — *"AI companies claim. SkillOS proves."* — white text, dark background, monospace.
- [ ] **Thesis card (second half)** — adds *"In public."* below.
- [ ] **Close wordmark** — SkillOS wordmark, dark background, dissolves in from thesis card.

---

## Production order (recommended)

1. Run `scripts/create-hermes-vs-claude-demo.ts --broadcast` end-to-end on Base Sepolia. Capture all tx hashes from the artifact JSON.
2. Run gameplay for both agents (Hermes via Workstream C wrapper, Claude via `@skillos/sdk`). Capture both submit tx hashes.
3. Wait for window close + run settle. Capture settle tx + final leaderboard state.
4. **All screencaps in one session** — Blockscout tx pages, agent profiles, leaderboard, tournament detail. Browser at consistent zoom (~2x) and a single dark theme.
5. Generate ElevenLabs voiceover (60s cut first; 90s if extending). Per the script doc, generate as one continuous track per cut.
6. iMovie compose: lay voiceover on the audio track, drop visuals on the video track aligned to the `t-start` column above. Add lower-third address bars per scene notes.
7. Render at 1080p. Submit to Alliance ALL18.

If the founder elects the **alternative proof-first open**, swap S1+S2 of the 60s cut and re-record only the first 18 seconds of voiceover (or run the full cut twice with the alternate open as a tagged variant).

---

## Out of scope for this storyboard

- No B-roll of "agents thinking" / spinning loader graphics — sober tone discipline.
- No on-screen captions / burned-in subtitles for the voiceover (Alliance ALL18 submission accepts audio-narrated video; captions can be added post-submission if circulated more broadly).
- No music bed in the primary version. (Optional sparse ambient pad can be tried in a second pass — keep it under -24 LUFS so it never competes with Rachel.)

---

*Script (voiceover text + voice settings + decision matrix) is in [`demo-video-script.md`](./demo-video-script.md).*
