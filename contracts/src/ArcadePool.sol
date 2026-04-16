// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ArcadePool is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    IERC20 public immutable USDC;
    address public scoreSigner;
    uint256 public protocolFeeBps = 1000; // 10%
    address public feeRecipient;
    uint256 public nextTournamentId;

    struct Tournament {
        bytes32 gameId;
        uint256 entryFee;
        uint256 startTime;
        uint256 endTime;
        uint256 totalPool;
        address creator;
        address winner;
        uint256 winnerScore;
        bool settled;
    }

    mapping(uint256 => Tournament) public tournaments;
    mapping(uint256 => mapping(address => bool)) public hasEntered;
    mapping(uint256 => mapping(address => uint256)) public playerScores;
    mapping(uint256 => address[]) public playerList;
    mapping(uint256 => bool) public usedNonces;

    bytes32 private constant SCORE_TYPEHASH = keccak256(
        "Score(uint256 tournamentId,address player,uint256 score,uint256 nonce)"
    );

    event TournamentCreated(uint256 indexed id, bytes32 gameId, uint256 entryFee, uint256 endTime);
    event PlayerEntered(uint256 indexed id, address indexed player);
    event ScoreSubmitted(uint256 indexed id, address indexed player, uint256 score);
    event TournamentSettled(uint256 indexed id, address indexed winner, uint256 prize);

    constructor(address _usdc, address _scoreSigner, address _feeRecipient)
        Ownable(msg.sender)
        EIP712("ArcadePool", "1")
    {
        USDC = IERC20(_usdc);
        scoreSigner = _scoreSigner;
        feeRecipient = _feeRecipient;
    }

    function createTournament(bytes32 gameId, uint256 entryFee, uint256 duration)
        external returns (uint256 id)
    {
        require(entryFee > 0, "Entry fee required");
        require(duration >= 1 minutes && duration <= 7 days, "Invalid duration");
        id = nextTournamentId++;
        tournaments[id] = Tournament({
            gameId: gameId,
            entryFee: entryFee,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            totalPool: 0,
            creator: msg.sender,
            winner: address(0),
            winnerScore: 0,
            settled: false
        });
        emit TournamentCreated(id, gameId, entryFee, block.timestamp + duration);
    }

    function enter(uint256 tournamentId) external nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        require(t.entryFee > 0, "Tournament does not exist");
        require(block.timestamp < t.endTime, "Tournament ended");
        require(!hasEntered[tournamentId][msg.sender], "Already entered");
        USDC.safeTransferFrom(msg.sender, address(this), t.entryFee);
        hasEntered[tournamentId][msg.sender] = true;
        playerList[tournamentId].push(msg.sender);
        t.totalPool += t.entryFee;
        emit PlayerEntered(tournamentId, msg.sender);
    }

    function submitScore(uint256 tournamentId, uint256 score, uint256 nonce, bytes calldata signature) external {
        Tournament storage t = tournaments[tournamentId];
        require(hasEntered[tournamentId][msg.sender], "Not entered");
        require(block.timestamp <= t.endTime, "Tournament ended");
        require(!usedNonces[nonce], "Nonce used");

        bytes32 structHash = keccak256(abi.encode(SCORE_TYPEHASH, tournamentId, msg.sender, score, nonce));
        bytes32 digest = _hashTypedDataV4(structHash);
        require(digest.recover(signature) == scoreSigner, "Invalid signature");

        usedNonces[nonce] = true;

        if (score > playerScores[tournamentId][msg.sender]) {
            playerScores[tournamentId][msg.sender] = score;
            if (score > t.winnerScore) {
                t.winnerScore = score;
                t.winner = msg.sender;
            }
        }
        emit ScoreSubmitted(tournamentId, msg.sender, score);
    }

    function settle(uint256 tournamentId) external nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        require(block.timestamp > t.endTime, "Still active");
        require(!t.settled, "Already settled");
        require(t.winner != address(0), "No winner");
        t.settled = true;
        uint256 fee = (t.totalPool * protocolFeeBps) / 10000;
        uint256 prize = t.totalPool - fee;
        USDC.safeTransfer(feeRecipient, fee);
        USDC.safeTransfer(t.winner, prize);
        emit TournamentSettled(tournamentId, t.winner, prize);
    }

    function refundIfEmpty(uint256 tournamentId) external nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        require(block.timestamp > t.endTime, "Still active");
        require(!t.settled, "Already settled");
        require(t.winner == address(0), "Has winner");
        t.settled = true;
        address[] memory players = playerList[tournamentId];
        for (uint256 i = 0; i < players.length; i++) {
            USDC.safeTransfer(players[i], t.entryFee);
        }
    }

    function getPlayerCount(uint256 tournamentId) external view returns (uint256) {
        return playerList[tournamentId].length;
    }

    function getTournament(uint256 tournamentId) external view returns (Tournament memory) {
        return tournaments[tournamentId];
    }

    function setScoreSigner(address _signer) external onlyOwner { scoreSigner = _signer; }
    function setFeeRecipient(address _recipient) external onlyOwner { feeRecipient = _recipient; }
    function setProtocolFee(uint256 _bps) external onlyOwner {
        require(_bps <= 3000, "Max 30%");
        protocolFeeBps = _bps;
    }
}
