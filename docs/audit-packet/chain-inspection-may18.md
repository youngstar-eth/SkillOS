# SkillOS Chain Inspection Snapshot — May 18, 2026

> **Purpose:** Single-file capture of all on-chain verification results from the May 17-18 X10b chain-verify session. Standalone audit packet asset; complements `skillos-wallet-topology.md` and `skillos-threat-model.md`.
>
> **Network:** Base Sepolia (chain id `84532`, slug `base-sepolia-testnet`)
> **Inspection time:** May 17 20:30 UTC → May 18 ~01:10 UTC
> **Tooling:** BlockchainQuery MCP + raw eth_call

---

## 1. TournamentPool v2.1 — privileged role state

**Contract:** `0x52049b812780134d2F69D6c20C2ef881D49702da` (verified May 18)

| Role | Function selector | Return value | Status |
|---|---|---|---|
| `owner()` | `0x8da5cb5b` | `0x3A4F9eB7fba1A0015A6f070259f3B9e883D95eEE` | ✓ **Distinct EOA from STUDIO/trustedSigner — audit posture upgrade** |
| `trustedSigner()` | `0xf74d5480` | `0xA24f9122568E98B72f4dDD61119C7D92D0975692` | ✓ Confirms Q-W1 manifest fix (PR #119), matches STUDIO key |
| `feeVault()` | `0x478222c2` | (revert) | ⚠ **v2.1 has NO separate feeVault EOA** — fees accumulate in contract balance directly |
| `treasury()` | `0x61d027b3` | (revert) | Not aliased under common alternative name |
| `feeRecipient()` | `0x46904840` | (revert) | Not aliased under common alternative name |

**Key finding:** v2.1 design accumulates retry fees in the TournamentPool contract storage; Owner withdraws via single-bucket function (likely `emergencyWithdraw` or pattern). v2.2 (X11 sprint) introduces `withdrawFeesToDev` + `withdrawFeesToPlatform` recipient split — this will add 2 new role-distinct EOAs at mainnet deploy.

## 2. Owner role stability

**Recent OwnershipTransferred event scan:**

- Topic[0]: `0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0`
- Window: ~100k blocks ending at latest (≈ May 15 22:00 UTC → May 18 ~01:10 UTC, ~55 hours)
- Result: **empty array** — no ownership transfers in window

**Conclusion:** Owner stable recently. Full backward provenance search (constructor emission at deploy time) requires paginated 100k-block windows back to deploy block (~April 28, 2026 ≈ block 40,800,000). Deferred for tomorrow.

## 3. EOA balance + funding state (May 18 ~01:10 UTC)

| EOA | Address | ETH Balance | Operational note |
|---|---|---|---|
| Owner | `0x3A4F9eB7fba1A0015A6f070259f3B9e883D95eEE` | 0.004798 | Minimal reserve, fine for owner role (low-frequency tx) |
| STUDIO / trustedSigner | `0xA24f9122568E98B72f4dDD61119C7D92D0975692` | 0.029339 | Operational broadcaster reserve, healthy |
| AGENT (X15.3 split) | `0xf481b744c0CB432baD42babB30616790bbA69c91` | 0.000597 | **Low — top-up may be needed for sustained agent retry tx** |
| Legacy AGENT (pre-X15.3) | `0x1569A95eaF3bB970E5c03F53f026849864C39fdA` | 0.051844 | ⚠️ **Hâlâ best-funded EOA in topology** — drain + revoke before mainnet cutover; on-chain authorizations on ChallengeEscrow still active per CR1 R3 §8 |

## 4. Audit posture upgrades from this inspection

| Risk row (previous) | Status post-verification |
|---|---|
| "Owner + trustedSigner single-EOA concentration" | **Downgraded** — verified distinct EOAs on v2.1. Concentration remaining = `setFeeVault` authority on single Owner EOA. |
| "Owner = Deployer testnet consolidation" | **Reframed** — Owner exists as distinct EOA; provenance (is it the original Deployer, or transferred?) pending paginated event scan. |
| "feeVault as separate role-distinct EOA at mainnet" | **Refined for v2.2** — Mainnet topology will gain 2 new EOAs (dev recipient + platform recipient) per X11 contract design, not 1. |

## 5. Pending verifications (next session)

- [ ] **Owner provenance** — full backward OwnershipTransferred scan to confirm `0x3A4F9eB7...` is original Deployer vs transferred ownership. Tooling: paginated 100k-block queries back to ~block 40,800,000.
- [ ] **`0x3A4F9eB7...d95EEE` purpose-distinct verification** — nonce + outgoing tx history check to confirm this EOA hasn't been used for operational broadcasts (would conflate Owner with broadcaster role).
- [ ] **SponsorshipModule owner verification** — address needed from founder grep; verify same/different Owner as TournamentPool.
- [ ] **ChallengeEscrow legacy AGENT authorization scan** — find active grants to `0x1569A95e...` for revocation list.
- [ ] **x402 receive wallet** — grep `apps/api/src/lib/x402-config.ts` or equivalent for receive address; classify if distinct from sponsor / platform wallets.
- [ ] **TournamentPool fee withdrawal recipient (v2.1 actual)** — examine event history for `EmergencyWithdrawal` / `FeesWithdrawn` event signatures to identify where Owner has withdrawn fees TO historically. Reveals the "implicit feeVault" address even though `feeVault()` getter doesn't exist.

## 6. Verification command reference

```bash
# Re-run owner check
cast call 0x52049b812780134d2F69D6c20C2ef881D49702da \
  "owner()(address)" --rpc-url https://sepolia.base.org
# Expected: 0x3A4F9eB7fba1A0015A6f070259f3B9e883D95eEE

# Re-run trustedSigner check
cast call 0x52049b812780134d2F69D6c20C2ef881D49702da \
  "trustedSigner()(address)" --rpc-url https://sepolia.base.org
# Expected: 0xA24f9122568E98B72f4dDD61119C7D92D0975692

# Confirm feeVault still reverts (v2.1)
cast call 0x52049b812780134d2F69D6c20C2ef881D49702da \
  "feeVault()(address)" --rpc-url https://sepolia.base.org
# Expected: revert (function does not exist in v2.1 ABI)

# Re-run balance snapshot
for addr in \
  0x3A4F9eB7fba1A0015A6f070259f3B9e883D95eEE \
  0xA24f9122568E98B72f4dDD61119C7D92D0975692 \
  0xf481b744c0CB432baD42babB30616790bbA69c91 \
  0x1569A95eaF3bB970E5c03F53f026849864C39fdA; do
  echo "$addr: $(cast balance $addr --rpc-url https://sepolia.base.org --ether) ETH"
done

# Backward Ownership event paginated scan (run in chunks of 100k)
# Starting recent and working backward toward block 40,800,000:
cast logs --rpc-url https://sepolia.base.org \
  --address 0x52049b812780134d2F69D6c20C2ef881D49702da \
  --from-block <start> --to-block <start+100000> \
  0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0
```

## 7. Cross-references

- `skillos-wallet-topology.md` — updated to v2 reflecting these findings (May 18 ~00:55 UTC)
- `skillos-threat-model.md` — STRIDE matrix downgraded 3 rows per these findings (May 18 ~01:00 UTC)
- `architecture-doc-supplement-v1.5.md` — §2.7 chain-verified subsection (in-container only; addendum PR pending tomorrow)
- Memory canonical #14 (X10b chain-verified) — captures Path A + Path B tx evidence
- PR #121 — X10b human path dataSuffix, merged May 17 20:11 UTC
- PR #124 — v1.5 supplement, merged May 17 (chain-verified subsection NOT yet on main; needs follow-up PR)
