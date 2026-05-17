# NatSpec Gaps — `contracts/src/*.sol`

> Generated from solhint `use-natspec` rule output (`raw/solhint.txt`).
> 185 distinct NatSpec violations across the 8 source contracts + 1 interface.

## Methodology

`solhint:recommended` flags every external/public event, function, and parameter that
lacks `@notice`, `@param`, or `@return`. `@param` "mismatch" warnings indicate the doc
comment names a parameter that doesn't exist on the declaration (typically the doc was
omitted entirely, leaving solhint's expected-params calculation with `Found: []`).

External auditors generally treat missing NatSpec as Informational severity but a
significant readability blocker. This document gives the per-file breakdown the team
can work through before external review kicks off.

## Summary by file

| Contract | use-natspec hits | Posture |
|---|---:|---|
| `TournamentPool.sol` | ~100 | Function-level NatSpec is detailed (block comments above each function); event tags are entirely missing (`TournamentCreated`, `ScoreSubmitted`, etc.). |
| `ChallengeEscrow.sol` | ~30 | Same pattern — function block comments present, event tags absent. |
| `ArcadePool.sol` | ~50 | **No NatSpec at all.** No `///` comments anywhere. Treat as a green-field write. |
| `SkillbaseAnchor.sol` | small | Function NatSpec is decent; some events missing tags. |
| `SponsorshipModule.sol` | small | Solid coverage; minor event-tag gaps. |
| `SponsorReceiptSBT.sol` | small | Good coverage; minor `@notice` gaps on metadata helpers. |
| `DevAttributionNFT.sol` | 0–few | Exemplary NatSpec — use as the team standard. |
| `MockSanctionsOracle.sol` | small | Adequate for a test-only contract. |
| `ISanctionsOracle.sol` | 0 | Complete. |

## Detail (top 10 occurrences by detector + locator)

The full per-line list lives in `raw/solhint.txt` filtered to lines containing
`use-natspec`. Recurring patterns the auditor will see:

1. **Missing `@notice` on events** — every `event Foo(...)` declaration in `TournamentPool`
   and `ChallengeEscrow`. Solhint emits one warning per missing tag.
2. **`@param` mismatch** on events — solhint computes expected param names from the
   declaration and reports `Expected: [...], Found: []` for events with no doc block.
   This duplicates the `@notice` warning above; resolving the `@notice` clears most of
   these.
3. **Missing function-level `@param` / `@return`** — primarily on internal helpers and
   view functions in `TournamentPool` (`getRanking`, `effectiveScoreOf`, etc.) and
   `ArcadePool` everywhere.
4. **ArcadePool**: every public function (`createTournament`, `enter`, `submitScore`,
   `settle`, `refundIfEmpty`, the four setters) lacks `@notice` / `@param`. Highest
   single-file remediation density.

## Recommended next step

Adopt `DevAttributionNFT.sol` as the documentation reference. The natural order of
remediation is:

1. ArcadePool — full pass (highest hit density, ~50)
2. TournamentPool — events first (drains most of the count), then helpers
3. ChallengeEscrow — events
4. SponsorshipModule + SponsorReceiptSBT + SkillbaseAnchor — minor cleanup

Tracking issue should reference `raw/solhint.txt` for the authoritative line list.
