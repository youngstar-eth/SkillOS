# X11.5 — Testnet Rehearsal Plan (Base Sepolia)

## Pre-rehearsal

- [ ] Hardware wallet initialized + seed backed up
- [ ] Wallet funded with ~0.01 Base Sepolia ETH (faucet)
- [ ] Confirm current Owner (chain-verified May 18 = `0x3A4F9eB7fba1A0015A6f070259f3B9e883D95eEE`)
- [ ] Confirm founder has access to current Owner key (verify via test signature off-chain before rehearsal)

## Rehearsal steps

1. **Deploy Safe Wallet (Sepolia):**
   ```
   bash contracts/scripts/x11-5/deploy-safe-1of1.sh <hardware-wallet-addr>
   ```
   Output: Safe Wallet address (testnet-specific)

2. **Verify Safe state:**
   ```
   cast call <safe-addr> "getOwners()(address[])" --rpc-url https://sepolia.base.org
   cast call <safe-addr> "getThreshold()(uint256)" --rpc-url https://sepolia.base.org
   ```
   Expected: 1 owner (hardware wallet addr), threshold 1

3. **Transfer TournamentPool ownership (Sepolia):**
   ```
   cast send 0x52049b812780134d2F69D6c20C2ef881D49702da \
     "transferOwnership(address)" <safe-addr> \
     --rpc-url https://sepolia.base.org \
     --private-key $TESTNET_OWNER_KEY
   ```

4. **Verify post-transfer:**
   ```
   cast call 0x52049b812780134d2F69D6c20C2ef881D49702da \
     "owner()(address)" --rpc-url https://sepolia.base.org
   ```
   Expected: Safe Wallet address

5. **Test owner-gated action via Safe UI:**
   - Open https://app.safe.global on Base Sepolia
   - Connect hardware wallet
   - Propose tx: TournamentPool.setFeeVault(<test-addr>) or similar
   - Sign + execute
   - Verify state change

6. **Document rehearsal results in REHEARSAL_LOG.md** (new file post-completion)

## Failure modes to test

- [ ] What happens if hardware wallet disconnected mid-ceremony? (Tx pending in Safe UI, can resume on reconnect)
- [ ] What happens if gas estimate insufficient? (Tx fails, retry with higher limit)
- [ ] What happens if Safe UI doesn't recognize chain? (Manually add Base Sepolia network)

## Post-rehearsal cleanup

After successful rehearsal, leave testnet Safe Wallet deployed (don't transfer ownership back) — serves as continuous reference for audit firm.
