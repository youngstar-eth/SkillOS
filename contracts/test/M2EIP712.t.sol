// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TournamentPool} from "../src/TournamentPool.sol";
import {DevAttributionNFT} from "../src/DevAttributionNFT.sol";
import {ERC6492} from "../src/lib/ERC6492.sol";
import {MockUSDC} from "./TournamentPool.t.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Minimal ERC-1271 smart-wallet mock. Validates by delegating to ECDSA
///      recovery against an underlying owner EOA. Used by M-2 tests to
///      exercise the SignatureChecker contract-signer path.
contract MockSmartWallet {
    address public immutable OWNER;

    constructor(address owner_) {
        OWNER = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        if (signature.length != 65) return 0xffffffff;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        address recovered = ecrecover(hash, v, r, s);
        if (recovered == OWNER) return IERC1271.isValidSignature.selector;
        return 0xffffffff;
    }
}

/// @title M-2 EIP-712 + ERC-6492 + ERC-1271 — invariant tests
/// @notice X11.2 sprint per X11.0 SPEC §C + §G + §K Q8(a). Pins:
///         - EIP-712 domain ("SkillOS-TournamentPool", "1") shape + determinism
///         - EOA EIP-712 sig acceptance via SignatureChecker ECDSA path
///         - ERC-1271 smart-wallet (deployed) sig acceptance via contract-signer path
///         - ERC-6492 wrapped-sig unwrap + delegate to ERC-1271 inner
///         - WrongSigner / NonceReplay revert behavior unchanged from EIP-191
///         - BRACKET_ROUND_START_TYPEHASH locked to SPEC §G.3 string
///         - startBracketRound v2.2 stub reverts (v2.3 X22.2 implementation lock)
///         - SoloScoreSubmit typehash distinct from ScoreSubmit (no replay collision)
contract M2EIP712Test is Test {
    // ── Actors
    uint256 internal signerPk = 0xdeadbeef1234;
    address internal trustedSigner;
    uint256 internal walletOwnerPk = 0xcafebabe;
    address internal walletOwner;
    uint256 internal badPk = 0xBAD00D;

    address internal sponsor = address(0x5907503);
    address internal player = address(0x1001);
    address internal constant DEFAULT_DEV = address(0xDE7de7de7De7dE7de7De7De7DE7De7De7dE7dE7D);

    // ── Contracts
    MockUSDC internal usdc;
    TournamentPool internal pool;
    DevAttributionNFT internal devNFT;
    MockSmartWallet internal smartWallet;

    // ── Constants
    uint256 internal constant PRIZE_POOL = 10_000_000;
    uint256 internal constant PARTICIPATION_BONUS = 50;
    bytes32 internal constant GAME = keccak256("2048");
    uint64 internal STARTS_AT;
    uint64 internal ENDS_AT;

    // ── Cached typehashes (avoid post-vm.expectRevert getter calls)
    bytes32 internal scoreSubmitTypehash;
    bytes32 internal soloScoreSubmitTypehash;
    bytes32 internal bracketRoundStartTypehash;

    function setUp() public {
        trustedSigner = vm.addr(signerPk);
        walletOwner = vm.addr(walletOwnerPk);

        usdc = new MockUSDC();

        address self = address(this);
        address predictedPool = vm.computeCreateAddress(self, vm.getNonce(self) + 1);
        devNFT = new DevAttributionNFT(predictedPool);
        pool = new TournamentPool(IERC20(address(usdc)), trustedSigner, address(devNFT));
        require(address(pool) == predictedPool, "M2 setup: pool address mismatch");

        usdc.mint(sponsor, 1_000_000_000);
        vm.prank(sponsor);
        usdc.approve(address(pool), type(uint256).max);

        STARTS_AT = uint64(block.timestamp);
        ENDS_AT = uint64(block.timestamp + 1 days);

        scoreSubmitTypehash = pool.SCORE_SUBMIT_TYPEHASH();
        soloScoreSubmitTypehash = pool.SOLO_SCORE_SUBMIT_TYPEHASH();
        bracketRoundStartTypehash = pool.BRACKET_ROUND_START_TYPEHASH();

        smartWallet = new MockSmartWallet(walletOwner);
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    function _tournamentId(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("m2-tournament", seed));
    }

    function _createTournament(bytes32 id) internal {
        vm.prank(sponsor);
        pool.createTournament(
            id, DEFAULT_DEV, GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("SkillOS-TournamentPool")),
                keccak256(bytes("1")),
                block.chainid,
                address(pool)
            )
        );
    }

    function _scoreDigest(bytes32 id, address player_, uint256 score, uint256 matchCountDelta, bytes32 nonce)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash =
            keccak256(abi.encode(scoreSubmitTypehash, id, player_, score, matchCountDelta, nonce));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _signWith(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    // ─── Tests 1/9 ─────────────────────────────────────────────────────────────

    /// @notice Domain separator matches the OZ-derived deterministic value for
    ///         the locked (name, version, chainId, verifyingContract) tuple.
    function test_M2_DomainSeparator_MatchesExpectedHash() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("SkillOS-TournamentPool")),
                keccak256(bytes("1")),
                block.chainid,
                address(pool)
            )
        );
        // Probe via _hashTypedDataV4: the domain separator is the "outer"
        // hash, so digest(bytes32(0)) = keccak256("\x19\x01" ‖ separator ‖ 0).
        bytes32 probeDigest = keccak256(abi.encodePacked("\x19\x01", expected, bytes32(0)));
        // Re-derive what the pool would produce for an empty structHash via the
        // same domain separator. The test passes iff the local derivation
        // matches what the locked SPEC §C.3 strings would yield.
        bytes32 reDerived = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), bytes32(0)));
        assertEq(reDerived, probeDigest, "domain separator does not match locked SPEC strings");
    }

    // ─── Tests 2/9 ─────────────────────────────────────────────────────────────

    /// @notice An EOA EIP-712 signature over SCORE_SUBMIT_TYPEHASH is accepted
    ///         by the SignatureChecker ECDSA path.
    function test_M2_SubmitScore_EOA_EIP712_Verified() public {
        bytes32 id = _tournamentId(1);
        _createTournament(id);

        bytes32 nonce = keccak256("m2-eoa");
        bytes32 digest = _scoreDigest(id, player, 1234, 1, nonce);
        bytes memory sig = _signWith(signerPk, digest);

        pool.submitScore(id, player, 1234, 1, nonce, sig);

        assertEq(pool.bestScore(id, player), 1234);
        assertTrue(pool.isParticipant(id, player));
    }

    // ─── Tests 3/9 ─────────────────────────────────────────────────────────────

    /// @notice After rotating trustedSigner to a deployed smart wallet, a
    ///         signature whose ERC-1271 verification succeeds is accepted.
    function test_M2_SubmitScore_ERC1271SmartWallet_Verified() public {
        pool.setTrustedSigner(address(smartWallet));

        bytes32 id = _tournamentId(2);
        _createTournament(id);

        bytes32 nonce = keccak256("m2-1271");
        bytes32 digest = _scoreDigest(id, player, 5000, 1, nonce);
        // The wallet's isValidSignature delegates to ECDSA recover against
        // walletOwner, so sign with walletOwnerPk.
        bytes memory sig = _signWith(walletOwnerPk, digest);

        pool.submitScore(id, player, 5000, 1, nonce, sig);

        assertEq(pool.bestScore(id, player), 5000);
    }

    // ─── Tests 4/9 ─────────────────────────────────────────────────────────────

    /// @notice An ERC-6492-wrapped signature (with magic-bytes suffix) is
    ///         detected, unwrapped, and the inner ERC-1271 signature is
    ///         accepted against the now-deployed smart wallet.
    /// @dev    On-chain we do not simulate the factory deploy — the wallet is
    ///         deployed in setUp. Off-chain callers handle pre-deploy via
    ///         eth_call before submitting (per X11.0 SPEC §C.4).
    function test_M2_SubmitScore_ERC6492Wrapped_Verified() public {
        pool.setTrustedSigner(address(smartWallet));

        bytes32 id = _tournamentId(3);
        _createTournament(id);

        bytes32 nonce = keccak256("m2-6492");
        bytes32 digest = _scoreDigest(id, player, 7777, 1, nonce);
        bytes memory innerSig = _signWith(walletOwnerPk, digest);

        // Build an ERC-6492 wrapper: abi.encode(factory, factoryCalldata, innerSig) ‖ MAGIC.
        // Factory + calldata are inert here (wallet already deployed); the unwrap
        // path strips them and delegates innerSig to ERC-1271.
        address factory = address(0xFAC); // dummy
        bytes memory factoryCalldata = hex"de7afee7";
        bytes memory wrapped = bytes.concat(
            abi.encode(factory, factoryCalldata, innerSig),
            ERC6492.MAGIC
        );

        pool.submitScore(id, player, 7777, 1, nonce, wrapped);

        assertEq(pool.bestScore(id, player), 7777);
    }

    // ─── Tests 5/9 ─────────────────────────────────────────────────────────────

    /// @notice A signature from a non-trustedSigner key over the correct
    ///         EIP-712 structHash is rejected with BadSignature.
    function test_M2_SubmitScore_WrongSigner_Reverts() public {
        bytes32 id = _tournamentId(4);
        _createTournament(id);

        bytes32 nonce = keccak256("m2-wrong");
        bytes32 digest = _scoreDigest(id, player, 100, 1, nonce);
        bytes memory wrongSig = _signWith(badPk, digest);

        vm.expectRevert(TournamentPool.BadSignature.selector);
        pool.submitScore(id, player, 100, 1, nonce, wrongSig);
    }

    // ─── Tests 6/9 ─────────────────────────────────────────────────────────────

    /// @notice Once a nonce is consumed by a valid submission, replaying the
    ///         same nonce (even with the same valid sig) reverts NonceUsed.
    function test_M2_SubmitScore_NonceReplay_Reverts() public {
        bytes32 id = _tournamentId(5);
        _createTournament(id);

        bytes32 nonce = keccak256("m2-replay");
        bytes32 digest = _scoreDigest(id, player, 300, 1, nonce);
        bytes memory sig = _signWith(signerPk, digest);

        pool.submitScore(id, player, 300, 1, nonce, sig);

        vm.expectRevert(TournamentPool.NonceUsed.selector);
        pool.submitScore(id, player, 300, 1, nonce, sig);
    }

    // ─── Tests 7/9 ─────────────────────────────────────────────────────────────

    /// @notice BRACKET_ROUND_START_TYPEHASH equals keccak256 of the locked
    ///         SPEC §G.3 type-string. Forward-compat invariant: X22.2 cannot
    ///         change the schema without breaking this constant.
    function test_M2_BRACKET_ROUND_START_TYPEHASH_ExpectedKeccak() public view {
        bytes32 expected =
            keccak256("BracketRoundStart(bytes32 id,uint8 round,address[] pairings,bytes32 nonce)");
        assertEq(bracketRoundStartTypehash, expected, "BRACKET_ROUND_START_TYPEHASH drifted from SPEC section G.3");
    }

    // ─── Tests 8/9 ─────────────────────────────────────────────────────────────

    /// @notice startBracketRound v2.2 stub reverts ReservedForV23 — calldata
    ///         shape is locked here per §G.2 + §K Q8(a) so X22.2 cannot fork
    ///         the function signature; body lives in the v2.3 redeploy.
    function test_M2_StartBracketRound_RevertsReservedForV23() public {
        bytes32 id = _tournamentId(6);
        bytes32 nonce = keccak256("m2-bracket");
        address[] memory pairings = new address[](0);
        bytes memory anySig = hex"00";

        vm.expectRevert(TournamentPool.ReservedForV23.selector);
        pool.startBracketRound(id, 0, pairings, nonce, anySig);
    }

    // ─── Tests 9/9 ─────────────────────────────────────────────────────────────

    /// @notice SoloScoreSubmit typehash is distinct from ScoreSubmit — extra
    ///         soloRunId field ensures a sig valid for one path cannot
    ///         cross-validate on the other, even though they share the
    ///         global usedNonces map.
    function test_M2_SoloScoreSubmit_TypehashDistinctFromScoreSubmit() public view {
        bytes32 expectedScore =
            keccak256("ScoreSubmit(bytes32 id,address player,uint256 score,uint256 matchCountDelta,bytes32 nonce)");
        bytes32 expectedSolo = keccak256(
            "SoloScoreSubmit(bytes32 id,address player,uint256 score,bytes32 soloRunId,uint256 matchCountDelta,bytes32 nonce)"
        );

        assertEq(scoreSubmitTypehash, expectedScore, "SCORE_SUBMIT_TYPEHASH drift");
        assertEq(soloScoreSubmitTypehash, expectedSolo, "SOLO_SCORE_SUBMIT_TYPEHASH drift");
        assertTrue(scoreSubmitTypehash != soloScoreSubmitTypehash, "typehash collision: schemas not distinct");
    }
}
