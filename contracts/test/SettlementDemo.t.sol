// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SettlementDemo} from "../src/SettlementDemo.sol";

/// @title SettlementDemoTest
/// @notice Faz 0 Pitch-MVP — standalone optimistic-challenge settlement loop on
///         2048 (B-minimal). Tests the four lock criteria from the dispatch:
///           (a) honest claim → finalize → credit
///           (b) fraudulent claim → challenge → resolve → slash claimer
///           (c) challenge-window timing (no finalize early, no challenge late)
///           (d) seedCommit is READ + load-bearing (reveal, claim, resolve)
///         plus the honest-but-challenged branch (slash challenger), bond
///         accounting, and access control.
///
/// Derived from Settlement & Verification SPEC §3 (optimistic + challenge) and
/// Challenge & Dispute Economics SPEC §1–2 (one bond accounting, winner takes
/// the pot — no protocol cut in the minimal demo). Standalone: touches neither
/// ChallengeEscrow nor the v2.3 settle path. Bond asset = native test ETH.
contract SettlementDemoTest is Test {
    SettlementDemo internal demo;

    address internal owner = makeAddr("owner");
    address internal resolver = makeAddr("resolver");
    address internal claimer = makeAddr("claimer");
    address internal challenger = makeAddr("challenger");
    address internal attacker = makeAddr("attacker");

    // 2048 golden vector: seed "replay-determinism" + 7 moves → score 20.
    string internal constant SEED = "replay-determinism";
    string internal constant WRONG_SEED = "not-the-committed-seed";
    uint256 internal constant GOLDEN_SCORE = 20;
    uint256 internal constant FRAUD_SCORE = 9999;

    bytes32 internal seedCommit; // keccak256(bytes(SEED)), set in setUp
    bytes32 internal constant ARENA = keccak256("arena-1");
    bytes32 internal constant CLAIM = keccak256("claim-1");
    bytes32 internal constant INPUT_LOG_HASH = keccak256("inputlog-7-moves");

    uint64 internal constant WINDOW = 1 hours;
    uint256 internal constant CLAIM_BOND = 0.01 ether;
    uint256 internal constant CHALLENGER_BOND = 0.005 ether;
    uint256 internal constant POT = CLAIM_BOND + CHALLENGER_BOND;

    uint256 internal constant START_TS = 1_000_000;
    uint256 internal constant FUND = 1 ether;

    function setUp() public {
        vm.warp(START_TS);
        seedCommit = keccak256(bytes(SEED));
        vm.prank(owner);
        demo = new SettlementDemo(resolver);
        vm.deal(claimer, FUND);
        vm.deal(challenger, FUND);
        vm.deal(attacker, FUND);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    function _createArena() internal {
        vm.prank(owner);
        demo.createArena(ARENA, seedCommit, WINDOW, CLAIM_BOND, CHALLENGER_BOND);
    }

    function _createAndReveal() internal {
        _createArena();
        vm.prank(owner);
        demo.revealSeed(ARENA, SEED);
    }

    function _submitClaim(uint256 score) internal {
        vm.prank(claimer);
        demo.submitClaim{value: CLAIM_BOND}(CLAIM, ARENA, score, seedCommit, INPUT_LOG_HASH);
    }

    // ── createArena ───────────────────────────────────────────────────────────

    function test_createArena_setsCommittedState() public {
        _createArena();
        SettlementDemo.Arena memory a = demo.getArena(ARENA);
        assertEq(uint8(a.state), uint8(SettlementDemo.ArenaState.Committed), "state Committed");
        assertEq(a.seedCommit, seedCommit, "seedCommit stored");
        assertEq(a.challengeWindow, WINDOW, "window stored");
        assertEq(a.claimBond, CLAIM_BOND, "claimBond stored");
        assertEq(a.challengerBond, CHALLENGER_BOND, "challengerBond stored");
    }

    function test_createArena_revertsIfExists() public {
        _createArena();
        vm.prank(owner);
        vm.expectRevert(SettlementDemo.ArenaExists.selector);
        demo.createArena(ARENA, seedCommit, WINDOW, CLAIM_BOND, CHALLENGER_BOND);
    }

    function test_createArena_onlyOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        demo.createArena(ARENA, seedCommit, WINDOW, CLAIM_BOND, CHALLENGER_BOND);
    }

    function test_createArena_revertsOnZeroWindow() public {
        vm.prank(owner);
        vm.expectRevert(SettlementDemo.BadConfig.selector);
        demo.createArena(ARENA, seedCommit, 0, CLAIM_BOND, CHALLENGER_BOND);
    }

    // ── revealSeed (seedCommit READ #1) ─────────────────────────────────────────

    function test_revealSeed_opensArena() public {
        _createArena();
        vm.prank(owner);
        demo.revealSeed(ARENA, SEED);
        SettlementDemo.Arena memory a = demo.getArena(ARENA);
        assertEq(uint8(a.state), uint8(SettlementDemo.ArenaState.Open), "state Open");
        assertEq(a.seed, SEED, "seed published on-chain");
    }

    /// (d) seedCommit is load-bearing: a reveal that does not hash to the
    /// committed value is rejected.
    function test_revealSeed_revertsOnBadSeed() public {
        _createArena();
        vm.prank(owner);
        vm.expectRevert(SettlementDemo.BadSeedReveal.selector);
        demo.revealSeed(ARENA, WRONG_SEED);
    }

    function test_revealSeed_revertsIfAlreadyRevealed() public {
        _createAndReveal();
        vm.prank(owner);
        vm.expectRevert(SettlementDemo.SeedAlreadyRevealed.selector);
        demo.revealSeed(ARENA, SEED);
    }

    function test_revealSeed_revertsIfArenaMissing() public {
        vm.prank(owner);
        vm.expectRevert(SettlementDemo.ArenaNotFound.selector);
        demo.revealSeed(ARENA, SEED);
    }

    // ── submitClaim ─────────────────────────────────────────────────────────────

    function test_submitClaim_opensWindow() public {
        _createAndReveal();
        _submitClaim(GOLDEN_SCORE);

        SettlementDemo.Claim memory c = demo.getClaim(CLAIM);
        assertEq(uint8(c.state), uint8(SettlementDemo.ClaimState.Claimed), "state Claimed");
        assertEq(c.claimer, claimer, "claimer stored");
        assertEq(c.score, GOLDEN_SCORE, "score stored");
        assertEq(c.deadline, uint64(START_TS) + WINDOW, "deadline = now + window");
        assertEq(c.claimBond, CLAIM_BOND, "claim bond recorded");
        assertEq(address(demo).balance, CLAIM_BOND, "bond escrowed in contract");
        assertEq(claimer.balance, FUND - CLAIM_BOND, "bond debited from claimer");
    }

    function test_submitClaim_revertsIfArenaNotOpen() public {
        _createArena(); // committed but seed NOT revealed
        vm.prank(claimer);
        vm.expectRevert(SettlementDemo.ArenaNotOpen.selector);
        demo.submitClaim{value: CLAIM_BOND}(CLAIM, ARENA, GOLDEN_SCORE, seedCommit, INPUT_LOG_HASH);
    }

    /// (d) seedCommit is load-bearing: a claim whose seedRef does not match the
    /// arena commitment is rejected (the claim is bound to the committed seed).
    function test_submitClaim_revertsOnSeedRefMismatch() public {
        _createAndReveal();
        vm.prank(claimer);
        vm.expectRevert(SettlementDemo.SeedRefMismatch.selector);
        demo.submitClaim{value: CLAIM_BOND}(CLAIM, ARENA, GOLDEN_SCORE, keccak256("other"), INPUT_LOG_HASH);
    }

    function test_submitClaim_revertsOnWrongBond() public {
        _createAndReveal();
        vm.prank(claimer);
        vm.expectRevert(SettlementDemo.BadBond.selector);
        demo.submitClaim{value: CLAIM_BOND - 1}(CLAIM, ARENA, GOLDEN_SCORE, seedCommit, INPUT_LOG_HASH);
    }

    function test_submitClaim_revertsIfClaimExists() public {
        _createAndReveal();
        _submitClaim(GOLDEN_SCORE);
        vm.prank(claimer);
        vm.expectRevert(SettlementDemo.ClaimExists.selector);
        demo.submitClaim{value: CLAIM_BOND}(CLAIM, ARENA, GOLDEN_SCORE, seedCommit, INPUT_LOG_HASH);
    }

    // ── (a) honest claim → finalize → credit ──────────────────────────────────

    function test_honestClaim_finalize_credits() public {
        _createAndReveal();
        _submitClaim(GOLDEN_SCORE);

        vm.warp(START_TS + WINDOW + 1); // past the window
        demo.finalize(CLAIM);

        SettlementDemo.Claim memory c = demo.getClaim(CLAIM);
        assertEq(uint8(c.state), uint8(SettlementDemo.ClaimState.Finalized), "state Finalized");
        assertEq(c.creditedScore, GOLDEN_SCORE, "score credited");
        assertEq(claimer.balance, FUND, "claimer bond returned in full");
        assertEq(address(demo).balance, 0, "no funds stranded");
    }

    // ── (c) challenge-window timing ────────────────────────────────────────────

    function test_finalize_revertsWithinWindow() public {
        _createAndReveal();
        _submitClaim(GOLDEN_SCORE);
        // still inside the window (no warp)
        vm.expectRevert(SettlementDemo.WindowOpen.selector);
        demo.finalize(CLAIM);
    }

    function test_finalize_revertsIfChallenged() public {
        _createAndReveal();
        _submitClaim(GOLDEN_SCORE);
        vm.prank(challenger);
        demo.challenge{value: CHALLENGER_BOND}(CLAIM);

        vm.warp(START_TS + WINDOW + 1);
        vm.expectRevert(SettlementDemo.NotInClaimState.selector);
        demo.finalize(CLAIM);
    }

    function test_challenge_revertsAfterWindow() public {
        _createAndReveal();
        _submitClaim(GOLDEN_SCORE);
        vm.warp(START_TS + WINDOW + 1); // window closed
        vm.prank(challenger);
        vm.expectRevert(SettlementDemo.WindowClosed.selector);
        demo.challenge{value: CHALLENGER_BOND}(CLAIM);
    }

    function test_challenge_revertsOnWrongBond() public {
        _createAndReveal();
        _submitClaim(GOLDEN_SCORE);
        vm.prank(challenger);
        vm.expectRevert(SettlementDemo.BadBond.selector);
        demo.challenge{value: CHALLENGER_BOND + 1}(CLAIM);
    }

    function test_challenge_revertsIfNotClaimed() public {
        _createAndReveal();
        vm.prank(challenger);
        vm.expectRevert(SettlementDemo.NotInClaimState.selector);
        demo.challenge{value: CHALLENGER_BOND}(CLAIM); // claim never submitted
    }

    // ── (b) fraudulent claim → challenge → resolve → slash claimer ─────────────

    function test_fraudClaim_challenge_resolve_slashesClaimer() public {
        _createAndReveal();
        _submitClaim(FRAUD_SCORE); // claimer lies: 9999

        vm.prank(challenger);
        demo.challenge{value: CHALLENGER_BOND}(CLAIM);

        // resolver re-ran verify(SEED, inputLog) → true score 20 ≠ claimed 9999
        vm.prank(resolver);
        demo.resolve(CLAIM, SEED, GOLDEN_SCORE);

        SettlementDemo.Claim memory c = demo.getClaim(CLAIM);
        assertEq(uint8(c.state), uint8(SettlementDemo.ClaimState.ResolvedFraud), "state ResolvedFraud");
        assertEq(c.creditedScore, 0, "fraud credits nothing");
        // claimer bond → challenger; challenger recovers own bond too (the pot).
        assertEq(challenger.balance, FUND - CHALLENGER_BOND + POT, "challenger took the pot");
        assertEq(claimer.balance, FUND - CLAIM_BOND, "claimer lost its bond");
        assertEq(address(demo).balance, 0, "no funds stranded");
    }

    // ── honest-but-challenged → resolve → slash challenger ─────────────────────

    function test_honestClaim_challenge_resolve_slashesChallenger() public {
        _createAndReveal();
        _submitClaim(GOLDEN_SCORE); // honest: 20

        vm.prank(challenger);
        demo.challenge{value: CHALLENGER_BOND}(CLAIM);

        // resolver re-ran verify(SEED, inputLog) → 20 == claimed 20 → claim honest
        vm.prank(resolver);
        demo.resolve(CLAIM, SEED, GOLDEN_SCORE);

        SettlementDemo.Claim memory c = demo.getClaim(CLAIM);
        assertEq(uint8(c.state), uint8(SettlementDemo.ClaimState.ResolvedHonest), "state ResolvedHonest");
        assertEq(c.creditedScore, GOLDEN_SCORE, "honest score credited");
        // challenger bond slashed → claimer; claimer recovers own bond (the pot).
        assertEq(claimer.balance, FUND - CLAIM_BOND + POT, "claimer took the pot");
        assertEq(challenger.balance, FUND - CHALLENGER_BOND, "challenger lost its bond");
        assertEq(address(demo).balance, 0, "no funds stranded");
    }

    // ── (d) seedCommit READ in the resolve path (audit-#1 reversal) ────────────

    /// The resolver cannot resolve against a seed other than the committed one:
    /// resolve re-derives keccak256(replaySeed) and checks it equals seedCommit.
    function test_resolve_revertsOnUncommittedSeed() public {
        _createAndReveal();
        _submitClaim(FRAUD_SCORE);
        vm.prank(challenger);
        demo.challenge{value: CHALLENGER_BOND}(CLAIM);

        vm.prank(resolver);
        vm.expectRevert(SettlementDemo.SeedRefMismatch.selector);
        demo.resolve(CLAIM, WRONG_SEED, GOLDEN_SCORE);
    }

    // ── resolve access control + state guards ──────────────────────────────────

    function test_resolve_onlyResolver() public {
        _createAndReveal();
        _submitClaim(GOLDEN_SCORE);
        vm.prank(challenger);
        demo.challenge{value: CHALLENGER_BOND}(CLAIM);

        vm.prank(attacker);
        vm.expectRevert(SettlementDemo.NotResolver.selector);
        demo.resolve(CLAIM, SEED, GOLDEN_SCORE);
    }

    function test_resolve_revertsIfNotChallenged() public {
        _createAndReveal();
        _submitClaim(GOLDEN_SCORE); // claimed but not challenged
        vm.prank(resolver);
        vm.expectRevert(SettlementDemo.NotChallenged.selector);
        demo.resolve(CLAIM, SEED, GOLDEN_SCORE);
    }

    // ── admin: setResolver ─────────────────────────────────────────────────────

    function test_setResolver_onlyOwner() public {
        address newResolver = makeAddr("newResolver");
        vm.prank(owner);
        demo.setResolver(newResolver);
        assertEq(demo.resolver(), newResolver, "resolver updated");

        vm.prank(attacker);
        vm.expectRevert();
        demo.setResolver(attacker);
    }

    function test_constructor_revertsOnZeroResolver() public {
        vm.expectRevert(SettlementDemo.ZeroAddress.selector);
        new SettlementDemo(address(0));
    }
}
