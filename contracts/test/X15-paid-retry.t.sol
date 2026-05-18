// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TournamentPool} from "../src/TournamentPool.sol";
import {DevAttributionNFT} from "../src/DevAttributionNFT.sol";
import {MockUSDC} from "./TournamentPool.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

/// @notice X15.4 — x402-orchestrated paid-retry test coverage (ADR 0003 D1, D11).
///
///         The on-chain function under test is `chargeEntryFee`. In the X15 lexicon
///         this fee is the "retry" fee — the first solo submission is free, the
///         (N≥2)-th submission requires (N-1)·ENTRY_FEE pre-paid. Test names use
///         `chargeRetryFee` for parity with ADR 0003 / scope doc; bodies call the
///         real `chargeEntryFee` selector.
///
///         Extends the free-first + paid-Nth coverage at TournamentPool.t.sol:756-855
///         (which is `test_submitSolo_*`) with cases specific to the x402
///         orchestration: msg.sender constraint, allowance prerequisite,
///         charge→submit chain, N-th accumulator, Builder Code dataSuffix.
///         Self-contained setUp mirrors TournamentPool.t.sol so this file shares
///         no state with the existing suite.
contract X15PaidRetryTest is Test {
    // ── Actors
    uint256 internal signerPk = 0xdeadbeef1234;
    address internal trustedSigner;
    address internal sponsor = address(0x5907503);
    address internal alice = address(0x1001);
    address internal bob = address(0x1002);
    address internal constant DEFAULT_DEV = address(0xDE7de7de7De7dE7de7De7De7DE7De7De7dE7dE7D);

    // ── Contracts
    MockUSDC internal usdc;
    TournamentPool internal pool;
    DevAttributionNFT internal devNFT;

    // ── Constants (mirror TournamentPool.t.sol)
    uint256 internal constant PRIZE_POOL = 10_000_000; // 10 USDC
    uint256 internal constant PARTICIPATION_BONUS = 50;
    uint256 internal constant ENTRY_FEE = 1_000_000; // 1 USDC
    bytes32 internal constant GAME = keccak256("2048");
    uint64 internal STARTS_AT;
    uint64 internal ENDS_AT;

    // ── Cached EIP-712 typehash (see TournamentPool.t.sol for rationale).
    bytes32 internal soloScoreSubmitTypehash;

    function setUp() public {
        trustedSigner = vm.addr(signerPk);

        usdc = new MockUSDC();

        address self = address(this);
        address predictedPool = vm.computeCreateAddress(self, vm.getNonce(self) + 1);
        devNFT = new DevAttributionNFT(predictedPool);
        pool = new TournamentPool(IERC20(address(usdc)), trustedSigner, address(devNFT));
        require(address(pool) == predictedPool, "X15.4 setup: pool address mismatch");

        usdc.mint(sponsor, 1_000_000_000);
        vm.prank(sponsor);
        usdc.approve(address(pool), type(uint256).max);

        STARTS_AT = uint64(block.timestamp);
        ENDS_AT = uint64(block.timestamp + 1 days);

        soloScoreSubmitTypehash = pool.SOLO_SCORE_SUBMIT_TYPEHASH();
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    function _tournamentId(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("x15.4-tournament", seed));
    }

    function _createTournament(bytes32 id) internal {
        vm.prank(sponsor);
        pool.createTournament(
            id, DEFAULT_DEV, GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );
    }

    function _fundAndApprove(address player, uint256 amount) internal {
        usdc.mint(player, amount);
        vm.prank(player);
        usdc.approve(address(pool), type(uint256).max);
    }

    function _signSoloSubmit(
        bytes32 id,
        address player,
        uint256 score,
        bytes32 soloRunId,
        uint256 matchCountDelta,
        bytes32 nonce
    ) internal view returns (bytes memory) {
        // EIP-712 SoloScoreSubmit attestation, M-2 (X11.2): typehash + domain
        // separator replace the legacy EIP-191 personal-sign digest. Typehash
        // is cached in setUp() to avoid a staticcall that vm.expectRevert
        // would misattribute to.
        bytes32 structHash = keccak256(
            abi.encode(soloScoreSubmitTypehash, id, player, score, soloRunId, matchCountDelta, nonce)
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("SkillOS-TournamentPool")),
                keccak256(bytes("1")),
                block.chainid,
                address(pool)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _submitSolo(bytes32 id, address player, uint256 score, uint256 matchCountDelta, uint256 nonceSeed)
        internal
    {
        bytes32 nonce = keccak256(abi.encodePacked("x15.4-solo", id, player, nonceSeed));
        bytes32 runId = keccak256(abi.encodePacked("x15.4-run", id, player, nonceSeed));
        bytes memory sig = _signSoloSubmit(id, player, score, runId, matchCountDelta, nonce);
        pool.submitSoloScore(id, player, score, runId, matchCountDelta, nonce, sig);
    }

    function _totalFees(bytes32 id) internal view returns (uint256) {
        return pool.feeCollected_dev(id) + pool.feeCollected_platform(id);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // X15.4 TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // ─── A. msg.sender == player constraint (ADR 0003 D1 R-MITIGATE-1) ─────────

    function test_chargeRetryFee_only_player_can_call() public {
        bytes32 id = _tournamentId(15401);
        _createTournament(id);

        _fundAndApprove(alice, 10 * ENTRY_FEE);
        _submitSolo(id, alice, 500, 1, 0);

        // Bob (e.g. compromised AGENT_PRIVATE_KEY) cannot pay on Alice's behalf.
        vm.prank(bob);
        vm.expectRevert(TournamentPool.PlayerMismatch.selector);
        pool.chargeEntryFee(id, alice);

        // Alice paying for herself succeeds — canonical x402-orchestrated path.
        vm.prank(alice);
        pool.chargeEntryFee(id, alice);
        assertEq(pool.feePaidByPlayer(id, alice), ENTRY_FEE);
    }

    // ─── B. USDC allowance prerequisite ────────────────────────────────────────

    function test_chargeRetryFee_requires_usdc_allowance() public {
        bytes32 id = _tournamentId(15402);
        _createTournament(id);

        // Mint without approval — deliberately skip _fundAndApprove.
        usdc.mint(alice, 10 * ENTRY_FEE);

        // OZ v5 ERC20 reverts with typed custom error on missing allowance.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(pool), uint256(0), ENTRY_FEE
            )
        );
        pool.chargeEntryFee(id, alice);

        // After approval (exact amount) → succeeds.
        vm.prank(alice);
        usdc.approve(address(pool), ENTRY_FEE);
        vm.prank(alice);
        pool.chargeEntryFee(id, alice);
        assertEq(pool.feePaidByPlayer(id, alice), ENTRY_FEE);
    }

    // ─── C. chargeRetryFee → submitSoloScore happy path (canonical X15 flow) ───

    function test_chargeRetryFee_then_submitSoloScore_passes() public {
        bytes32 id = _tournamentId(15403);
        _createTournament(id);

        _fundAndApprove(alice, 10 * ENTRY_FEE);

        // 1st solo (free) — trustedSigner broadcasts via STUDIO_PRIVATE_KEY in prod.
        _submitSolo(id, alice, 500, 1, 0);

        // x402-settled paid retry slot — AGENT_PRIVATE_KEY broadcasts in prod,
        // msg.sender must still be the player per ADR 0003 D1 R-MITIGATE-1.
        vm.prank(alice);
        pool.chargeEntryFee(id, alice);

        // 2nd solo submission now passes the (priorSolo * ENTRY_FEE) accumulator.
        _submitSolo(id, alice, 700, 1, 1);

        assertEq(pool.soloSubmissionCount(id, alice), 2);
        assertEq(pool.bestScore(id, alice), 700);
        assertEq(pool.feePaidByPlayer(id, alice), ENTRY_FEE);
        assertEq(_totalFees(id), ENTRY_FEE);
    }

    // ─── D. N-th submission requires (N-1) × ENTRY_FEE accumulator ─────────────

    function test_chargeRetryFee_n_times_then_n_submissions() public {
        bytes32 id = _tournamentId(15404);
        _createTournament(id);

        _fundAndApprove(alice, 100 * ENTRY_FEE);

        uint256 N = 5;
        _submitSolo(id, alice, 100, 1, 0); // 1st (free)

        for (uint256 i = 1; i < N; ++i) {
            vm.prank(alice);
            pool.chargeEntryFee(id, alice);
            _submitSolo(id, alice, 100 + i * 100, 1, i);
        }

        assertEq(pool.soloSubmissionCount(id, alice), N);
        assertEq(pool.feePaidByPlayer(id, alice), (N - 1) * ENTRY_FEE);
        assertEq(_totalFees(id), (N - 1) * ENTRY_FEE);
        assertEq(pool.bestScore(id, alice), 100 + (N - 1) * 100);
    }

    // ─── E. Builder Code dataSuffix attribution (ERC-8021 raw ASCII) ───────────

    function test_chargeRetryFee_dataSuffix_attribution() public {
        bytes32 id = _tournamentId(15405);
        _createTournament(id);

        _fundAndApprove(alice, 10 * ENTRY_FEE);

        // Builder Code `bc_o6szuvg1` → 11 bytes of raw ASCII per ERC-8021
        // (SDK currently emits 11B; spec moving to 16B structured per
        //  project_erc8021_encoder_spec_compliance memory note).
        bytes memory suffix = hex"62635f6f36737a75766731";
        assertEq(suffix.length, 11, "ERC-8021 Builder Code tail is 11 bytes");

        bytes memory base = abi.encodeWithSelector(pool.chargeEntryFee.selector, id, alice);
        bytes memory full = bytes.concat(base, suffix);

        // The trailing 22 hex chars (11 bytes) match the Builder Code exactly —
        // this is what Coinbase indexers read out of tx.input.
        assertEq(full.length, base.length + 11, "suffix appended once");
        for (uint256 i = 0; i < 11; ++i) {
            assertEq(full[base.length + i], suffix[i], "dataSuffix byte mismatch");
        }

        // Contract executes normally — Solidity ABI decoder ignores trailing
        // bytes past the encoded arg region, so the suffix never reaches the
        // function body. State mutation proves the call routed correctly.
        vm.prank(alice);
        (bool ok,) = address(pool).call(full);
        assertTrue(ok, "chargeEntryFee with appended dataSuffix must succeed");

        assertEq(pool.feePaidByPlayer(id, alice), ENTRY_FEE);
    }

    // ─── F. Regression guard for free-first → paid-Nth invariant ───────────────

    function test_submitSolo_revert_secondWithoutFee_invariant() public {
        // Locked here so any future change that breaks the free-first ordering
        // also breaks X15.4 coverage (not just TournamentPool.t.sol:777).
        bytes32 id = _tournamentId(15406);
        _createTournament(id);

        _submitSolo(id, alice, 500, 1, 0);

        vm.expectRevert(TournamentPool.InsufficientFeePaid.selector);
        _submitSolo(id, alice, 700, 1, 1);
    }
}
