# Report


## Gas Optimizations


| |Issue|Instances|
|-|:-|:-:|
| [GAS-1](#GAS-1) | Use ERC721A instead ERC721 | 2 |
| [GAS-2](#GAS-2) | `a = a + b` is more gas effective than `a += b` for state variables (excluding arrays and mappings) | 11 |
| [GAS-3](#GAS-3) | Using bools for storage incurs overhead | 10 |
| [GAS-4](#GAS-4) | Cache array length outside of loop | 1 |
| [GAS-5](#GAS-5) | For Operations that will not overflow, you could use unchecked | 95 |
| [GAS-6](#GAS-6) | Use Custom Errors instead of Revert Strings to save Gas | 16 |
| [GAS-7](#GAS-7) | Avoid contract existence checks by using low level calls | 7 |
| [GAS-8](#GAS-8) | Functions guaranteed to revert when called by normal users can be marked `payable` | 14 |
| [GAS-9](#GAS-9) | `++i` costs less gas compared to `i++` or `i += 1` (same for `--i` vs `i--` or `i -= 1`) | 3 |
| [GAS-10](#GAS-10) | Using `private` rather than `public` for constants, saves gas | 8 |
| [GAS-11](#GAS-11) | Use shift right/left instead of division/multiplication if possible | 5 |
| [GAS-12](#GAS-12) | Splitting require() statements that use && saves gas | 1 |
| [GAS-13](#GAS-13) | `uint256` to `bool` `mapping`: Utilizing Bitmaps to dramatically save on Gas | 1 |
| [GAS-14](#GAS-14) | Increments/decrements can be unchecked in for-loops | 9 |
| [GAS-15](#GAS-15) | Use != 0 instead of > 0 for unsigned integer comparison | 6 |
### <a name="GAS-1"></a>[GAS-1] Use ERC721A instead ERC721
ERC721A standard, ERC721A is an improvement standard for ERC721 tokens. It was proposed by the Azuki team and used for developing their NFT collection. Compared with ERC721, ERC721A is a more gas-efficient standard to mint a lot of of NFTs simultaneously. It allows developers to mint multiple NFTs at the same gas price. This has been a great improvement due to Ethereum's sky-rocketing gas fee.

    Reference: https://nextrope.com/erc721-vs-erc721a-2/

*Instances (2)*:
```solidity
File: src/DevAttributionNFT.sol

4: import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

```

```solidity
File: src/SponsorReceiptSBT.sol

4: import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

```

### <a name="GAS-2"></a>[GAS-2] `a = a + b` is more gas effective than `a += b` for state variables (excluding arrays and mappings)
This saves **16 gas per instance.**

*Instances (11)*:
```solidity
File: src/ArcadePool.sol

85:         t.totalPool += t.entryFee;

```

```solidity
File: src/SponsorshipModule.sol

135:         sponsorContributions[tournamentId][msg.sender] += amount;

139:                 totalSponsorsByTournament[tournamentId] += 1;

```

```solidity
File: src/TournamentPool.sol

396:         t.prizePool += amount;

437:         matchCount[id][player] += matchCountDelta;

499:         matchCount[id][player] += matchCountDelta;

537:         feePaidByPlayer[id][player] += ENTRY_FEE;

538:         feeCollected_dev[id] += devShare;

539:         feeCollected_platform[id] += platformShare;

809:             totalDistributed += perPlace45;

820:                     totalDistributed += perPlaceT5;

```

### <a name="GAS-3"></a>[GAS-3] Using bools for storage incurs overhead
Use uint256(1) and uint256(2) for true/false to avoid a Gwarmaccess (100 gas), and to avoid Gsset (20000 gas) when changing from ‘false’ to ‘true’, after having been ‘true’ in the past. See [source](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/58f635312aa21f947cae5f8578638a85aa2519f5/contracts/security/ReentrancyGuard.sol#L23-L27).

*Instances (10)*:
```solidity
File: src/ArcadePool.sol

34:     mapping(uint256 => mapping(address => bool)) public hasEntered;

37:     mapping(uint256 => bool) public usedNonces;

```

```solidity
File: src/MockSanctionsOracle.sol

21:     mapping(address => bool) public sanctioned;

```

```solidity
File: src/SkillbaseAnchor.sol

56:     mapping(address => bool) public authorizedAnchors;

```

```solidity
File: src/SponsorshipModule.sol

74:     mapping(bytes32 => mapping(address => bool)) private _hasSponsored;

```

```solidity
File: src/TournamentPool.sol

212:     mapping(address => bool) public devNFTMinted;

224:     mapping(bytes32 => mapping(address => bool)) public excluded;

227:     mapping(bytes32 => mapping(address => bool)) public isParticipant;

230:     mapping(bytes32 => bool) public usedNonces;

234:     mapping(bytes32 => mapping(address => bool)) private _seenInRanking;

```

### <a name="GAS-4"></a>[GAS-4] Cache array length outside of loop
If not cached, the solidity compiler will always read the length of the array during each iteration. That is, if it is a storage array, this is an extra sload operation (100 additional extra gas for each iteration except for the first) and if it is a memory array, this is an extra mload operation (3 additional gas for each iteration except for the first).

*Instances (1)*:
```solidity
File: src/ArcadePool.sol

131:         for (uint256 i = 0; i < players.length; i++) {

```

### <a name="GAS-5"></a>[GAS-5] For Operations that will not overflow, you could use unchecked

*Instances (95)*:
```solidity
File: src/ArcadePool.sol

4: import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

5: import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

6: import "@openzeppelin/contracts/access/Ownable.sol";

7: import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

8: import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

9: import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

17:     uint256 public protocolFeeBps = 1000; // 10%

62:         id = nextTournamentId++;

67:             endTime: block.timestamp + duration,

74:         emit TournamentCreated(id, gameId, entryFee, block.timestamp + duration);

85:         t.totalPool += t.entryFee;

117:         uint256 fee = (t.totalPool * protocolFeeBps) / 10000;

118:         uint256 prize = t.totalPool - fee;

131:         for (uint256 i = 0; i < players.length; i++) {

```

```solidity
File: src/ChallengeEscrow.sol

4: import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

5: import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

6: import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

7: import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

8: import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

144:             expiresAt: block.timestamp + duration,

150:         emit ChallengeCreated(id, msg.sender, gameSlug, stake, block.timestamp + duration);

195:         uint256 totalPool = c.stake * 2;

196:         uint256 fee = (totalPool * FEE_BPS) / BPS_DENOMINATOR;

197:         uint256 payout = totalPool - fee;

252:         uint256 totalPool = c.stake * 2;

253:         uint256 fee = (totalPool * FEE_BPS) / BPS_DENOMINATOR;

254:         uint256 payout = totalPool - fee;

```

```solidity
File: src/DevAttributionNFT.sol

4: import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

```

```solidity
File: src/MockSanctionsOracle.sol

4: import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

5: import { ISanctionsOracle } from "./ISanctionsOracle.sol";

```

```solidity
File: src/SkillbaseAnchor.sol

4: import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

5: import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

88:         totalAnchored++;

```

```solidity
File: src/SponsorReceiptSBT.sol

4: import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

5: import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

6: import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";

66:     constructor(address minter) ERC721("Skillbase Sponsor Receipt", "SKILL-SBT") {

84:             tokenId = ++nextTokenId;

142:             abi.encodePacked("data:application/json;base64,", Base64.encode(json))

166:         for (uint256 i = 0; i < 32; ++i) {

167:             result[i * 2] = alphabet[uint8(value[i] >> 4)];

168:             result[i * 2 + 1] = alphabet[uint8(value[i] & 0x0f)];

```

```solidity
File: src/SponsorshipModule.sol

4: import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

5: import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

6: import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

7: import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

9: import { ISanctionsOracle } from "./ISanctionsOracle.sol";

10: import { SponsorReceiptSBT } from "./SponsorReceiptSBT.sol";

135:         sponsorContributions[tournamentId][msg.sender] += amount;

139:                 totalSponsorsByTournament[tournamentId] += 1;

```

```solidity
File: src/TournamentPool.sol

4: import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

5: import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

6: import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

7: import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

8: import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

10: import {IDevAttributionNFT} from "./DevAttributionNFT.sol";

190:     uint256 private constant TIER5_START_INDEX = 10; // 0-indexed: starts at place 11

396:         t.prizePool += amount;

437:         matchCount[id][player] += matchCountDelta;

486:         if (priorSolo >= 1 && feePaidByPlayer[id][player] < priorSolo * ENTRY_FEE) {

489:         soloSubmissionCount[id][player] = priorSolo + 1;

499:         matchCount[id][player] += matchCountDelta;

534:         uint256 devShare = (ENTRY_FEE * DEV_BPS) / TOTAL_BPS;

535:         uint256 platformShare = (ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS;

537:         feePaidByPlayer[id][player] += ENTRY_FEE;

538:         feeCollected_dev[id] += devShare;

539:         feeCollected_platform[id] += platformShare;

582:             refunded = t.prizePool - totalDistributed;

671:         for (uint256 i; i < n; ++i) {

672:             if (!excluded[id][t.participants[i]]) ++count;

677:         for (uint256 i; i < n; ++i) {

680:             entries[idx++] = RankEntry({

687:         for (uint256 i = 1; i < count; ++i) {

690:             while (j > 0 && entries[j - 1].effectiveScore < cur.effectiveScore) {

691:                 entries[j] = entries[j - 1];

693:                     --j;

716:         return best * SCORE_WEIGHT + cappedMc * bonus * PARTICIPATION_WEIGHT;

752:         for (uint256 i; i < n; ++i) {

755:                     ++c;

766:         for (uint256 i; i < len; ++i) {

795:         uint256 topN = (n + 1) / 2; // ceil(N / 2)

798:         _pay(id, ranking, 0, (pool * BPS_PLACE_1) / BPS_DENOMINATOR);

799:         _pay(id, ranking, 1, (pool * BPS_PLACE_2) / BPS_DENOMINATOR);

800:         _pay(id, ranking, 2, (pool * BPS_PLACE_3) / BPS_DENOMINATOR);

801:         totalDistributed = (pool * BPS_PLACE_1) / BPS_DENOMINATOR + (pool * BPS_PLACE_2) / BPS_DENOMINATOR

802:             + (pool * BPS_PLACE_3) / BPS_DENOMINATOR;

806:         uint256 perPlace45 = (pool * BPS_PLACES_4_TO_10) / BPS_DENOMINATOR;

807:         for (uint256 i = 3; i < tier4End; ++i) {

809:             totalDistributed += perPlace45;

814:             uint256 tier5Count = topN - TIER5_START_INDEX;

815:             uint256 tier5Pool = (pool * BPS_TIER5_POOL) / BPS_DENOMINATOR;

816:             uint256 perPlaceT5 = tier5Pool / tier5Count;

818:                 for (uint256 i = TIER5_START_INDEX; i < topN; ++i) {

820:                     totalDistributed += perPlaceT5;

830:         emit PrizePaid(id, winner, idx + 1, amount);

```

### <a name="GAS-6"></a>[GAS-6] Use Custom Errors instead of Revert Strings to save Gas
Custom errors are available from solidity version 0.8.4. Custom errors save [**~50 gas**](https://gist.github.com/IllIllI000/ad1bd0d29a0101b25e57c293b4b0c746) each time they're hit by [avoiding having to allocate and store the revert string](https://blog.soliditylang.org/2021/04/21/custom-errors/#errors-in-depth). Not defining the strings also save deployment gas

Additionally, custom errors can be used inside and outside of contracts (including interfaces and libraries).

Source: <https://blog.soliditylang.org/2021/04/21/custom-errors/>:

> Starting from [Solidity v0.8.4](https://github.com/ethereum/solidity/releases/tag/v0.8.4), there is a convenient and gas-efficient way to explain to users why an operation failed through the use of custom errors. Until now, you could already use strings to give more information about failures (e.g., `revert("Insufficient funds.");`), but they are rather expensive, especially when it comes to deploy cost, and it is difficult to use dynamic information in them.

Consider replacing **all revert strings** with custom errors in the solution, and particularly those that have multiple occurrences:

*Instances (16)*:
```solidity
File: src/ArcadePool.sol

60:         require(entryFee > 0, "Entry fee required");

61:         require(duration >= 1 minutes && duration <= 7 days, "Invalid duration");

79:         require(t.entryFee > 0, "Tournament does not exist");

80:         require(block.timestamp < t.endTime, "Tournament ended");

81:         require(!hasEntered[tournamentId][msg.sender], "Already entered");

91:         require(hasEntered[tournamentId][msg.sender], "Not entered");

92:         require(block.timestamp <= t.endTime, "Tournament ended");

93:         require(!usedNonces[nonce], "Nonce used");

97:         require(digest.recover(signature) == scoreSigner, "Invalid signature");

113:         require(block.timestamp > t.endTime, "Still active");

114:         require(!t.settled, "Already settled");

115:         require(t.winner != address(0), "No winner");

126:         require(block.timestamp > t.endTime, "Still active");

127:         require(!t.settled, "Already settled");

128:         require(t.winner == address(0), "Has winner");

147:         require(_bps <= 3000, "Max 30%");

```

### <a name="GAS-7"></a>[GAS-7] Avoid contract existence checks by using low level calls
Prior to 0.8.10 the compiler inserted extra code, including `EXTCODESIZE` (**100 gas**), to check for contract existence for external function calls. In more recent solidity versions, the compiler will not insert these checks if the external call has a return value. Similar behavior can be achieved in earlier versions by using low-level calls, since low level calls never check for contract existence

*Instances (7)*:
```solidity
File: src/ArcadePool.sol

97:         require(digest.recover(signature) == scoreSigner, "Invalid signature");

```

```solidity
File: src/ChallengeEscrow.sol

288:         uint256 balance = USDC.balanceOf(address(this));

313:         address signer = ECDSA.recover(ethDigest, signature);

320:         address signer = ECDSA.recover(ethDigest, signature);

```

```solidity
File: src/TournamentPool.sol

638:         uint256 balance = USDC.balanceOf(address(this));

729:         address signer = ECDSA.recover(ethDigest, signature);

746:         address signer = ECDSA.recover(ethDigest, signature);

```

### <a name="GAS-8"></a>[GAS-8] Functions guaranteed to revert when called by normal users can be marked `payable`
If a function modifier such as `onlyOwner` is used, the function will revert if a normal user tries to pay the function. Marking the function as `payable` will lower the gas cost for legitimate callers because the compiler will not include checks for whether a payment was provided.

*Instances (14)*:
```solidity
File: src/ArcadePool.sol

144:     function setScoreSigner(address _signer) external onlyOwner { scoreSigner = _signer; }

145:     function setFeeRecipient(address _recipient) external onlyOwner { feeRecipient = _recipient; }

146:     function setProtocolFee(uint256 _bps) external onlyOwner {

```

```solidity
File: src/ChallengeEscrow.sol

271:     function setFeeVault(address newVault) external onlyOwner {

278:     function setTrustedSigner(address newSigner) external onlyOwner {

286:     function emergencyWithdraw(address to) external onlyOwner {

```

```solidity
File: src/MockSanctionsOracle.sol

29:     function addToBlacklist(address addr) external onlyOwner {

36:     function removeFromBlacklist(address addr) external onlyOwner {

```

```solidity
File: src/SkillbaseAnchor.sol

118:     function setAuthorizedAnchor(address anchor, bool authorized) external onlyOwner {

```

```solidity
File: src/SponsorshipModule.sol

151:     function setSanctionsOracle(ISanctionsOracle newOracle) external onlyOwner {

```

```solidity
File: src/TournamentPool.sol

546:     function flagScore(bytes32 id, address player) external onlyOwner {

591:     function setTrustedSigner(address newSigner) external onlyOwner {

627:     function withdrawFeesToPlatform(bytes32 id) external onlyOwner nonReentrant {

636:     function emergencyWithdraw(address to) external onlyOwner {

```

### <a name="GAS-9"></a>[GAS-9] `++i` costs less gas compared to `i++` or `i += 1` (same for `--i` vs `i--` or `i -= 1`)
Pre-increments and pre-decrements are cheaper.

For a `uint256 i` variable, the following is true with the Optimizer enabled at 10k:

**Increment:**

- `i += 1` is the most expensive form
- `i++` costs 6 gas less than `i += 1`
- `++i` costs 5 gas less than `i++` (11 gas less than `i += 1`)

**Decrement:**

- `i -= 1` is the most expensive form
- `i--` costs 11 gas less than `i -= 1`
- `--i` costs 5 gas less than `i--` (16 gas less than `i -= 1`)

Note that post-increments (or post-decrements) return the old value before incrementing or decrementing, hence the name *post-increment*:

```solidity
uint i = 1;  
uint j = 2;
require(j == i++, "This will be false as i is incremented after the comparison");
```
  
However, pre-increments (or pre-decrements) return the new value:
  
```solidity
uint i = 1;  
uint j = 2;
require(j == ++i, "This will be true as i is incremented before the comparison");
```

In the pre-increment case, the compiler has to create a temporary variable (when used) for returning `1` instead of `2`.

Consider using pre-increments and pre-decrements where they are relevant (meaning: not where post-increments/decrements logic are relevant).

*Saves 5 gas per instance*

*Instances (3)*:
```solidity
File: src/ArcadePool.sol

62:         id = nextTournamentId++;

131:         for (uint256 i = 0; i < players.length; i++) {

```

```solidity
File: src/SkillbaseAnchor.sol

88:         totalAnchored++;

```

### <a name="GAS-10"></a>[GAS-10] Using `private` rather than `public` for constants, saves gas
If needed, the values can be read from the verified contract source code, or if there are multiple values there can be a single getter function that [returns a tuple](https://github.com/code-423n4/2022-08-frax/blob/90f55a9ce4e25bceed3a74290b854341d8de6afa/src/contracts/FraxlendPair.sol#L156-L178) of the values of all currently-public constants. Saves **3406-3606 gas** in deployment gas due to the compiler not having to create non-payable getter functions for deployment calldata, not having to store the bytes of the value outside of where it's used, and not adding another entry to the method ID table

*Instances (8)*:
```solidity
File: src/ChallengeEscrow.sol

71:     uint256 public constant FEE_BPS = 1000;

```

```solidity
File: src/TournamentPool.sol

155:     uint256 public constant SCORE_WEIGHT = 85;

158:     uint256 public constant PARTICIPATION_WEIGHT = 15;

162:     uint256 public constant MATCH_COUNT_CAP = 10;

167:     uint256 public constant ENTRY_FEE = 1_000_000;

176:     uint256 public constant DEV_BPS = 7000;

179:     uint256 public constant PLATFORM_BPS = 3000;

182:     uint256 public constant TOTAL_BPS = 10_000;

```

### <a name="GAS-11"></a>[GAS-11] Use shift right/left instead of division/multiplication if possible
While the `DIV` / `MUL` opcode uses 5 gas, the `SHR` / `SHL` opcode only uses 3 gas. Furthermore, beware that Solidity's division operation also includes a division-by-0 prevention which is bypassed using shifting. Eventually, overflow checks are never performed for shift operations as they are done for arithmetic operations. Instead, the result is always truncated, so the calculation can be unchecked in Solidity version `0.8+`
- Use `>> 1` instead of `/ 2`
- Use `>> 2` instead of `/ 4`
- Use `<< 3` instead of `* 8`
- ...
- Use `>> 5` instead of `/ 2^5 == / 32`
- Use `<< 6` instead of `* 2^6 == * 64`

TL;DR:
- Shifting left by N is like multiplying by 2^N (Each bits to the left is an increased power of 2)
- Shifting right by N is like dividing by 2^N (Each bits to the right is a decreased power of 2)

*Saves around 2 gas + 20 for unchecked per instance*

*Instances (5)*:
```solidity
File: src/ChallengeEscrow.sol

195:         uint256 totalPool = c.stake * 2;

252:         uint256 totalPool = c.stake * 2;

```

```solidity
File: src/SponsorReceiptSBT.sol

167:             result[i * 2] = alphabet[uint8(value[i] >> 4)];

168:             result[i * 2 + 1] = alphabet[uint8(value[i] & 0x0f)];

```

```solidity
File: src/TournamentPool.sol

795:         uint256 topN = (n + 1) / 2; // ceil(N / 2)

```

### <a name="GAS-12"></a>[GAS-12] Splitting require() statements that use && saves gas

*Instances (1)*:
```solidity
File: src/ArcadePool.sol

61:         require(duration >= 1 minutes && duration <= 7 days, "Invalid duration");

```

### <a name="GAS-13"></a>[GAS-13] `uint256` to `bool` `mapping`: Utilizing Bitmaps to dramatically save on Gas
https://soliditydeveloper.com/bitmaps

https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/structs/BitMaps.sol

- [BitMaps.sol#L5-L16](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/structs/BitMaps.sol#L5-L16):

```solidity
/**
 * @dev Library for managing uint256 to bool mapping in a compact and efficient way, provided the keys are sequential.
 * Largely inspired by Uniswap's https://github.com/Uniswap/merkle-distributor/blob/master/contracts/MerkleDistributor.sol[merkle-distributor].
 *
 * BitMaps pack 256 booleans across each bit of a single 256-bit slot of `uint256` type.
 * Hence booleans corresponding to 256 _sequential_ indices would only consume a single slot,
 * unlike the regular `bool` which would consume an entire slot for a single value.
 *
 * This results in gas savings in two ways:
 *
 * - Setting a zero value to non-zero only once every 256 times
 * - Accessing the same warm slot for every 256 _sequential_ indices
 */
```

*Instances (1)*:
```solidity
File: src/ArcadePool.sol

37:     mapping(uint256 => bool) public usedNonces;

```

### <a name="GAS-14"></a>[GAS-14] Increments/decrements can be unchecked in for-loops
In Solidity 0.8+, there's a default overflow check on unsigned integers. It's possible to uncheck this in for-loops and save some gas at each iteration, but at the cost of some code readability, as this uncheck cannot be made inline.

[ethereum/solidity#10695](https://github.com/ethereum/solidity/issues/10695)

The change would be:

```diff
- for (uint256 i; i < numIterations; i++) {
+ for (uint256 i; i < numIterations;) {
 // ...  
+   unchecked { ++i; }
}  
```

These save around **25 gas saved** per instance.

The same can be applied with decrements (which should use `break` when `i == 0`).

The risk of overflow is non-existent for `uint256`.

*Instances (9)*:
```solidity
File: src/ArcadePool.sol

131:         for (uint256 i = 0; i < players.length; i++) {

```

```solidity
File: src/SponsorReceiptSBT.sol

166:         for (uint256 i = 0; i < 32; ++i) {

```

```solidity
File: src/TournamentPool.sol

671:         for (uint256 i; i < n; ++i) {

677:         for (uint256 i; i < n; ++i) {

687:         for (uint256 i = 1; i < count; ++i) {

752:         for (uint256 i; i < n; ++i) {

766:         for (uint256 i; i < len; ++i) {

807:         for (uint256 i = 3; i < tier4End; ++i) {

818:                 for (uint256 i = TIER5_START_INDEX; i < topN; ++i) {

```

### <a name="GAS-15"></a>[GAS-15] Use != 0 instead of > 0 for unsigned integer comparison

*Instances (6)*:
```solidity
File: src/ArcadePool.sol

60:         require(entryFee > 0, "Entry fee required");

79:         require(t.entryFee > 0, "Tournament does not exist");

```

```solidity
File: src/ChallengeEscrow.sol

204:         if (fee > 0 && feeVault != address(0)) {

261:         if (fee > 0 && feeVault != address(0)) {

```

```solidity
File: src/TournamentPool.sol

690:             while (j > 0 && entries[j - 1].effectiveScore < cur.effectiveScore) {

817:             if (perPlaceT5 > 0) {

```


## Non Critical Issues


| |Issue|Instances|
|-|:-|:-:|
| [NC-1](#NC-1) | Use `string.concat()` or `bytes.concat()` instead of `abi.encodePacked` | 8 |
| [NC-2](#NC-2) | `constant`s should be defined rather than using magic numbers | 13 |
| [NC-3](#NC-3) | Control structures do not follow the Solidity Style Guide | 107 |
| [NC-4](#NC-4) | Consider disabling `renounceOwnership()` | 6 |
| [NC-5](#NC-5) | Functions should not be longer than 50 lines | 63 |
| [NC-6](#NC-6) | Use a `modifier` instead of a `require/if` statement for a special `msg.sender` actor | 11 |
| [NC-7](#NC-7) | Consider using named mappings | 26 |
| [NC-8](#NC-8) | Take advantage of Custom Error's return value property | 96 |
| [NC-9](#NC-9) | Avoid the use of sensitive terms | 6 |
| [NC-10](#NC-10) | Strings should use double quotes rather than single quotes | 8 |
| [NC-11](#NC-11) | Use Underscores for Number Literals (add an underscore every 3 digits) | 10 |
| [NC-12](#NC-12) | Constants should be defined rather than using magic numbers | 1 |
| [NC-13](#NC-13) | Variables need not be initialized to zero | 3 |
### <a name="NC-1"></a>[NC-1] Use `string.concat()` or `bytes.concat()` instead of `abi.encodePacked`
Solidity version 0.8.4 introduces `bytes.concat()` (vs `abi.encodePacked(<bytes>,<bytes>)`)

Solidity version 0.8.12 introduces `string.concat()` (vs `abi.encodePacked(<str>,<str>), which catches concatenation errors (in the event of a `bytes` data mixed in the concatenation)`)

*Instances (8)*:
```solidity
File: src/ChallengeEscrow.sol

312:         bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));

319:         bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));

```

```solidity
File: src/SponsorReceiptSBT.sol

142:             abi.encodePacked("data:application/json;base64,", Base64.encode(json))

148:         bytes memory head = abi.encodePacked(

153:         bytes memory attrs = abi.encodePacked(

160:         return abi.encodePacked(head, attrs);

```

```solidity
File: src/TournamentPool.sol

728:         bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));

745:         bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));

```

### <a name="NC-2"></a>[NC-2] `constant`s should be defined rather than using magic numbers
Even [assembly](https://github.com/code-423n4/2022-05-opensea-seaport/blob/9d7ce4d08bf3c3010304a0476a785c70c0e90ae7/contracts/lib/TokenTransferrer.sol#L35-L39) can benefit from using readable constants instead of hex/numeric literals

*Instances (13)*:
```solidity
File: src/ArcadePool.sol

17:     uint256 public protocolFeeBps = 1000; // 10%

61:         require(duration >= 1 minutes && duration <= 7 days, "Invalid duration");

117:         uint256 fee = (t.totalPool * protocolFeeBps) / 10000;

147:         require(_bps <= 3000, "Max 30%");

```

```solidity
File: src/ChallengeEscrow.sol

195:         uint256 totalPool = c.stake * 2;

252:         uint256 totalPool = c.stake * 2;

```

```solidity
File: src/SponsorReceiptSBT.sol

166:         for (uint256 i = 0; i < 32; ++i) {

167:             result[i * 2] = alphabet[uint8(value[i] >> 4)];

168:             result[i * 2 + 1] = alphabet[uint8(value[i] & 0x0f)];

```

```solidity
File: src/TournamentPool.sol

789:         if (n < 4) {

795:         uint256 topN = (n + 1) / 2; // ceil(N / 2)

800:         _pay(id, ranking, 2, (pool * BPS_PLACE_3) / BPS_DENOMINATOR);

807:         for (uint256 i = 3; i < tier4End; ++i) {

```

### <a name="NC-3"></a>[NC-3] Control structures do not follow the Solidity Style Guide
See the [control structures](https://docs.soliditylang.org/en/latest/style-guide.html#control-structures) section of the Solidity Style Guide

*Instances (107)*:
```solidity
File: src/ChallengeEscrow.sol

106:         if (address(_usdc) == address(0)) revert ZeroAddress();

107:         if (_trustedSigner == address(0)) revert ZeroAddress();

108:         if (_feeVault == address(0)) revert ZeroAddress();

131:         if (challenges[id].status != Status.None) revert ChallengeAlreadyExists();

132:         if (stake == 0) revert ZeroStake();

133:         if (duration == 0) revert ZeroDuration();

157:         if (c.status != Status.Open) revert ChallengeNotOpen();

158:         if (block.timestamp >= c.expiresAt) revert ChallengeHasExpired();

159:         if (msg.sender == c.creator) revert SelfChallenge();

160:         if (c.challenger != address(0)) revert AlreadyAccepted();

190:         if (c.status != Status.Accepted) revert ChallengeNotAccepted();

191:         if (winner != c.creator && winner != c.challenger) revert InvalidWinner();

193:         _verifySettleSignature(id, winner, creatorScore, challengerScore, signature);

215:         if (c.status != Status.Open) revert ChallengeNotOpen();

216:         if (block.timestamp < c.expiresAt) revert ChallengeNotExpired();

228:         if (c.status != Status.Accepted) revert ChallengeNotAccepted();

229:         if (block.timestamp < c.expiresAt) revert ChallengeNotExpired();

246:         if (c.status != Status.Accepted) revert ChallengeNotAccepted();

247:         if (block.timestamp < c.expiresAt) revert ChallengeNotExpired();

248:         if (winner != c.creator && winner != c.challenger) revert InvalidWinner();

250:         _verifyWalkoverSignature(id, winner, signature);

272:         if (newVault == address(0)) revert ZeroAddress();

279:         if (newSigner == address(0)) revert ZeroAddress();

287:         if (to == address(0)) revert ZeroAddress();

301:     function _verifySettleSignature(

314:         if (signer != trustedSigner) revert BadSignature();

321:         if (signer != trustedSigner) revert BadSignature();

```

```solidity
File: src/DevAttributionNFT.sol

67:         if (_tournamentPool == address(0)) revert ZeroAddress();

80:         if (msg.sender != tournamentPool) revert OnlyTournamentPool();

81:         if (dev == address(0)) revert ZeroAddress();

118:         if (from != address(0)) revert Soulbound();

```

```solidity
File: src/MockSanctionsOracle.sol

30:         if (addr == address(0)) revert ZeroAddress();

```

```solidity
File: src/SkillbaseAnchor.sol

64:         if (!authorizedAnchors[msg.sender] && msg.sender != owner()) revert UnauthorizedAnchor();

71:         if (_owner == address(0)) revert ZeroAddress();

83:         if (snapshotHash == bytes32(0)) revert InvalidHash();

84:         if (timestamp == 0) revert InvalidTimestamp();

85:         if (snapshots[timestamp] != bytes32(0)) revert AlreadyAnchored();

106:     function verifySnapshot(

119:         if (anchor == address(0)) revert ZeroAddress();

```

```solidity
File: src/SponsorReceiptSBT.sol

67:         if (minter == address(0)) revert ZeroAddress();

80:         if (msg.sender != MINTER) revert NotMinter();

81:         if (to == address(0)) revert ZeroAddress();

102:         if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();

117:         if (from != address(0) && to != address(0)) revert TransferLocked();

138:         if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();

```

```solidity
File: src/SponsorshipModule.sol

94:         if (address(usdc) == address(0)) revert ZeroAddress();

95:         if (address(pool) == address(0)) revert ZeroAddress();

96:         if (address(receipt) == address(0)) revert ZeroAddress();

97:         if (address(oracle) == address(0)) revert ZeroAddress();

127:         if (amount == 0) revert ZeroAmount();

128:         if (sanctionsOracle.isSanctioned(msg.sender)) revert SponsorSanctioned();

152:         if (address(newOracle) == address(0)) revert ZeroAddress();

```

```solidity
File: src/TournamentPool.sol

306:         if (address(_usdc) == address(0)) revert ZeroAddress();

307:         if (_trustedSigner == address(0)) revert ZeroAddress();

308:         if (_devNFT == address(0)) revert ZeroAddress();

340:         if (_tournaments[id].sponsor != address(0)) revert TournamentAlreadyExists();

341:         if (devAddr == address(0)) revert ZeroAddress();

342:         if (endsAt <= startsAt) revert InvalidWindow();

343:         if (prizePool == 0) revert ZeroPrize();

390:         if (amount == 0) revert ZeroPrize();

392:         if (t.sponsor == address(0)) revert TournamentNotFound();

393:         if (t.settled) revert TournamentAlreadySettled();

418:         if (t.sponsor == address(0)) revert TournamentNotFound();

419:         if (t.settled) revert TournamentAlreadySettled();

420:         if (block.timestamp < t.startsAt) revert TournamentNotStarted();

421:         if (block.timestamp >= t.endsAt) revert TournamentAlreadyEnded();

422:         if (usedNonces[nonce]) revert NonceUsed();

423:         if (player == address(0)) revert ZeroAddress();

425:         _verifySubmitSignature(id, player, score, matchCountDelta, nonce, signature);

473:         if (t.sponsor == address(0)) revert TournamentNotFound();

474:         if (t.settled) revert TournamentAlreadySettled();

475:         if (block.timestamp < t.startsAt) revert TournamentNotStarted();

476:         if (block.timestamp >= t.endsAt) revert TournamentAlreadyEnded();

477:         if (usedNonces[nonce]) revert NonceUsed();

478:         if (player == address(0)) revert ZeroAddress();

480:         _verifySoloSubmitSignature(id, player, score, soloRunId, matchCountDelta, nonce, signature);

525:         if (msg.sender != player) revert PlayerMismatch();

527:         if (t.sponsor == address(0)) revert TournamentNotFound();

528:         if (t.settled) revert TournamentAlreadySettled();

529:         if (block.timestamp < t.startsAt) revert TournamentNotStarted();

530:         if (block.timestamp >= t.endsAt) revert TournamentAlreadyEnded();

548:         if (t.sponsor == address(0)) revert TournamentNotFound();

549:         if (t.settled) revert TournamentAlreadySettled();

550:         if (!isParticipant[id][player]) revert PlayerNotInTournament();

565:         if (t.sponsor == address(0)) revert TournamentNotFound();

566:         if (t.settled) revert TournamentAlreadySettled();

567:         if (block.timestamp < t.endsAt) revert TournamentNotEnded();

570:         if (sortedRanking.length != expectedCount) revert InvalidRankingLength();

576:         _verifyRanking(id, t, sortedRanking);

592:         if (newSigner == address(0)) revert ZeroAddress();

611:         if (msg.sender != dev) revert OnlyDev();

613:         if (amount == 0) return;

629:         if (amount == 0) return;

637:         if (to == address(0)) revert ZeroAddress();

659:         if (excluded[id][player]) return 0;

672:             if (!excluded[id][t.participants[i]]) ++count;

679:             if (excluded[id][p]) continue;

719:     function _verifySubmitSignature(

730:         if (signer != trustedSigner) revert BadSignature();

733:     function _verifySoloSubmitSignature(

747:         if (signer != trustedSigner) revert BadSignature();

768:             if (!isParticipant[id][p]) revert NotParticipant();

769:             if (excluded[id][p]) revert PlayerExcluded();

770:             if (_seenInRanking[id][p]) revert DuplicateInRanking();

774:             if (sc > prevScore) revert InvalidRankingOrder();

784:         if (n == 0) return 0;

827:         if (amount == 0) return;

```

### <a name="NC-4"></a>[NC-4] Consider disabling `renounceOwnership()`
If the plan for your project does not include eventually giving up all ownership control, consider overwriting OpenZeppelin's `Ownable`'s `renounceOwnership()` function in order to disable it.

*Instances (6)*:
```solidity
File: src/ArcadePool.sol

11: contract ArcadePool is Ownable, ReentrancyGuard, EIP712 {

```

```solidity
File: src/ChallengeEscrow.sol

26: contract ChallengeEscrow is Ownable, ReentrancyGuard {

```

```solidity
File: src/MockSanctionsOracle.sol

18: contract MockSanctionsOracle is Ownable, ISanctionsOracle {

```

```solidity
File: src/SkillbaseAnchor.sol

34: contract SkillbaseAnchor is Ownable, ReentrancyGuard {

```

```solidity
File: src/SponsorshipModule.sol

41: contract SponsorshipModule is Ownable, ReentrancyGuard {

```

```solidity
File: src/TournamentPool.sol

66: contract TournamentPool is Ownable, ReentrancyGuard {

```

### <a name="NC-5"></a>[NC-5] Functions should not be longer than 50 lines
Overly complex code can make understanding functionality more difficult, try to further modularize your code to ensure readability 

*Instances (63)*:
```solidity
File: src/ArcadePool.sol

57:     function createTournament(bytes32 gameId, uint256 entryFee, uint256 duration)

77:     function enter(uint256 tournamentId) external nonReentrant {

89:     function submitScore(uint256 tournamentId, uint256 score, uint256 nonce, bytes calldata signature) external {

111:     function settle(uint256 tournamentId) external nonReentrant {

124:     function refundIfEmpty(uint256 tournamentId) external nonReentrant {

136:     function getPlayerCount(uint256 tournamentId) external view returns (uint256) {

140:     function getTournament(uint256 tournamentId) external view returns (Tournament memory) {

144:     function setScoreSigner(address _signer) external onlyOwner { scoreSigner = _signer; }

145:     function setFeeRecipient(address _recipient) external onlyOwner { feeRecipient = _recipient; }

146:     function setProtocolFee(uint256 _bps) external onlyOwner {

```

```solidity
File: src/ChallengeEscrow.sol

155:     function acceptChallenge(bytes32 id) external nonReentrant {

213:     function expireOpen(bytes32 id) external nonReentrant {

226:     function expireAccepted(bytes32 id) external nonReentrant {

244:     function walkover(bytes32 id, address winner, bytes calldata signature) external nonReentrant {

271:     function setFeeVault(address newVault) external onlyOwner {

278:     function setTrustedSigner(address newSigner) external onlyOwner {

286:     function emergencyWithdraw(address to) external onlyOwner {

295:     function getChallenge(bytes32 id) external view returns (Challenge memory) {

317:     function _verifyWalkoverSignature(bytes32 id, address winner, bytes calldata signature) internal view {

```

```solidity
File: src/DevAttributionNFT.sol

17:     function locked(uint256 tokenId) external view returns (bool);

91:     function locked(uint256 tokenId) external view returns (bool) {

100:     function approve(address, uint256) public pure override {

105:     function setApprovalForAll(address, bool) public pure override {

110:     function supportsInterface(bytes4 interfaceId) public view override returns (bool) {

116:     function _update(address to, uint256 tokenId, address auth) internal override returns (address) {

```

```solidity
File: src/ISanctionsOracle.sol

12:     function isSanctioned(address addr) external view returns (bool);

```

```solidity
File: src/MockSanctionsOracle.sol

29:     function addToBlacklist(address addr) external onlyOwner {

36:     function removeFromBlacklist(address addr) external onlyOwner {

42:     function isSanctioned(address addr) external view returns (bool) {

```

```solidity
File: src/SkillbaseAnchor.sol

98:     function getSnapshotHash(uint256 timestamp) external view returns (bytes32) {

118:     function setAuthorizedAnchor(address anchor, bool authorized) external onlyOwner {

```

```solidity
File: src/SponsorReceiptSBT.sol

79:     function mint(address to, bytes32 tournamentId, uint256 amount) external returns (uint256 tokenId) {

101:     function locked(uint256 tokenId) external view returns (bool) {

107:     function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {

115:     function _update(address to, uint256 tokenId, address auth) internal override returns (address) {

123:     function approve(address, uint256) public virtual override {

128:     function setApprovalForAll(address, bool) public virtual override {

137:     function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {

147:     function _buildJSON(uint256 tokenId, ReceiptMetadata memory r) internal pure returns (bytes memory) {

163:     function _toHexString(bytes32 value) internal pure returns (string memory) {

```

```solidity
File: src/SponsorshipModule.sol

15:     function fundPrizePool(bytes32 id, uint256 amount) external;

122:     function sponsorPool(bytes32 tournamentId, uint256 amount)

151:     function setSanctionsOracle(ISanctionsOracle newOracle) external onlyOwner {

```

```solidity
File: src/TournamentPool.sol

389:     function fundPrizePool(bytes32 id, uint256 amount) external nonReentrant {

524:     function chargeEntryFee(bytes32 id, address player) external nonReentrant {

546:     function flagScore(bytes32 id, address player) external onlyOwner {

563:     function settle(bytes32 id, address[] calldata sortedRanking) external nonReentrant {

591:     function setTrustedSigner(address newSigner) external onlyOwner {

609:     function withdrawFeesToDev(bytes32 id) external nonReentrant {

627:     function withdrawFeesToPlatform(bytes32 id) external onlyOwner nonReentrant {

636:     function emergencyWithdraw(address to) external onlyOwner {

644:     function getTournament(bytes32 id) external view returns (Tournament memory) {

648:     function getParticipants(bytes32 id) external view returns (address[] memory) {

652:     function participantCount(bytes32 id) external view returns (uint256) {

658:     function effectiveScoreOf(bytes32 id, address player) public view returns (uint256) {

666:     function getRanking(bytes32 id) external view returns (RankEntry[] memory) {

703:     function submissionHistoryLength(bytes32 id, address player) external view returns (uint256) {

708:     function submissionAt(bytes32 id, address player, uint256 index) external view returns (Submission memory) {

714:     function _computeEffectiveScore(uint256 best, uint256 mc, uint256 bonus) internal pure returns (uint256) {

750:     function _countNonExcluded(bytes32 id, Tournament storage t) internal view returns (uint256 c) {

761:     function _verifyRanking(bytes32 id, Tournament storage t, address[] calldata ranking) internal {

779:     function _distributePrizes(bytes32 id, Tournament storage t, address[] calldata ranking)

826:     function _pay(bytes32 id, address[] calldata ranking, uint256 idx, uint256 amount) internal {

```

### <a name="NC-6"></a>[NC-6] Use a `modifier` instead of a `require/if` statement for a special `msg.sender` actor
If a function is supposed to be access-controlled, a `modifier` should be used instead of a `require/if` statement for more readability.

*Instances (11)*:
```solidity
File: src/ArcadePool.sol

81:         require(!hasEntered[tournamentId][msg.sender], "Already entered");

91:         require(hasEntered[tournamentId][msg.sender], "Not entered");

101:         if (score > playerScores[tournamentId][msg.sender]) {

```

```solidity
File: src/ChallengeEscrow.sol

159:         if (msg.sender == c.creator) revert SelfChallenge();

```

```solidity
File: src/DevAttributionNFT.sol

80:         if (msg.sender != tournamentPool) revert OnlyTournamentPool();

```

```solidity
File: src/SkillbaseAnchor.sol

64:         if (!authorizedAnchors[msg.sender] && msg.sender != owner()) revert UnauthorizedAnchor();

```

```solidity
File: src/SponsorReceiptSBT.sol

80:         if (msg.sender != MINTER) revert NotMinter();

```

```solidity
File: src/SponsorshipModule.sol

128:         if (sanctionsOracle.isSanctioned(msg.sender)) revert SponsorSanctioned();

136:         if (!_hasSponsored[tournamentId][msg.sender]) {

```

```solidity
File: src/TournamentPool.sol

525:         if (msg.sender != player) revert PlayerMismatch();

611:         if (msg.sender != dev) revert OnlyDev();

```

### <a name="NC-7"></a>[NC-7] Consider using named mappings
Consider moving to solidity version 0.8.18 or later, and using [named mappings](https://ethereum.stackexchange.com/questions/51629/how-to-name-the-arguments-in-mapping/145555#145555) to make it easier to understand the purpose of each mapping

*Instances (26)*:
```solidity
File: src/ArcadePool.sol

33:     mapping(uint256 => Tournament) public tournaments;

34:     mapping(uint256 => mapping(address => bool)) public hasEntered;

35:     mapping(uint256 => mapping(address => uint256)) public playerScores;

36:     mapping(uint256 => address[]) public playerList;

37:     mapping(uint256 => bool) public usedNonces;

```

```solidity
File: src/ChallengeEscrow.sol

86:     mapping(bytes32 => Challenge) public challenges;

```

```solidity
File: src/MockSanctionsOracle.sol

21:     mapping(address => bool) public sanctioned;

```

```solidity
File: src/SkillbaseAnchor.sol

53:     mapping(uint256 => bytes32) public snapshots;

56:     mapping(address => bool) public authorizedAnchors;

```

```solidity
File: src/SponsorReceiptSBT.sol

57:     mapping(uint256 => ReceiptMetadata) public receiptOf;

```

```solidity
File: src/SponsorshipModule.sol

67:     mapping(bytes32 => mapping(address => uint256)) public sponsorContributions;

70:     mapping(bytes32 => uint256) public totalSponsorsByTournament;

74:     mapping(bytes32 => mapping(address => bool)) private _hasSponsored;

```

```solidity
File: src/TournamentPool.sol

212:     mapping(address => bool) public devNFTMinted;

215:     mapping(bytes32 => Tournament) internal _tournaments;

218:     mapping(bytes32 => mapping(address => uint256)) public bestScore;

221:     mapping(bytes32 => mapping(address => uint256)) public matchCount;

224:     mapping(bytes32 => mapping(address => bool)) public excluded;

227:     mapping(bytes32 => mapping(address => bool)) public isParticipant;

230:     mapping(bytes32 => bool) public usedNonces;

234:     mapping(bytes32 => mapping(address => bool)) private _seenInRanking;

237:     mapping(bytes32 => mapping(address => Submission[])) internal _submissionHistory;

241:     mapping(bytes32 => mapping(address => uint256)) public soloSubmissionCount;

245:     mapping(bytes32 => mapping(address => uint256)) public feePaidByPlayer;

251:     mapping(bytes32 => uint256) public feeCollected_dev;

258:     mapping(bytes32 => uint256) public feeCollected_platform;

```

### <a name="NC-8"></a>[NC-8] Take advantage of Custom Error's return value property
An important feature of Custom Error is that values such as address, tokenID, msg.value can be written inside the () sign, this kind of approach provides a serious advantage in debugging and examining the revert details of dapps such as tenderly.

*Instances (96)*:
```solidity
File: src/ChallengeEscrow.sol

106:         if (address(_usdc) == address(0)) revert ZeroAddress();

107:         if (_trustedSigner == address(0)) revert ZeroAddress();

108:         if (_feeVault == address(0)) revert ZeroAddress();

131:         if (challenges[id].status != Status.None) revert ChallengeAlreadyExists();

132:         if (stake == 0) revert ZeroStake();

133:         if (duration == 0) revert ZeroDuration();

157:         if (c.status != Status.Open) revert ChallengeNotOpen();

158:         if (block.timestamp >= c.expiresAt) revert ChallengeHasExpired();

159:         if (msg.sender == c.creator) revert SelfChallenge();

160:         if (c.challenger != address(0)) revert AlreadyAccepted();

190:         if (c.status != Status.Accepted) revert ChallengeNotAccepted();

191:         if (winner != c.creator && winner != c.challenger) revert InvalidWinner();

215:         if (c.status != Status.Open) revert ChallengeNotOpen();

216:         if (block.timestamp < c.expiresAt) revert ChallengeNotExpired();

228:         if (c.status != Status.Accepted) revert ChallengeNotAccepted();

229:         if (block.timestamp < c.expiresAt) revert ChallengeNotExpired();

246:         if (c.status != Status.Accepted) revert ChallengeNotAccepted();

247:         if (block.timestamp < c.expiresAt) revert ChallengeNotExpired();

248:         if (winner != c.creator && winner != c.challenger) revert InvalidWinner();

272:         if (newVault == address(0)) revert ZeroAddress();

279:         if (newSigner == address(0)) revert ZeroAddress();

287:         if (to == address(0)) revert ZeroAddress();

314:         if (signer != trustedSigner) revert BadSignature();

321:         if (signer != trustedSigner) revert BadSignature();

```

```solidity
File: src/DevAttributionNFT.sol

67:         if (_tournamentPool == address(0)) revert ZeroAddress();

80:         if (msg.sender != tournamentPool) revert OnlyTournamentPool();

81:         if (dev == address(0)) revert ZeroAddress();

101:         revert Soulbound();

106:         revert Soulbound();

118:         if (from != address(0)) revert Soulbound();

```

```solidity
File: src/MockSanctionsOracle.sol

30:         if (addr == address(0)) revert ZeroAddress();

```

```solidity
File: src/SkillbaseAnchor.sol

64:         if (!authorizedAnchors[msg.sender] && msg.sender != owner()) revert UnauthorizedAnchor();

71:         if (_owner == address(0)) revert ZeroAddress();

83:         if (snapshotHash == bytes32(0)) revert InvalidHash();

84:         if (timestamp == 0) revert InvalidTimestamp();

85:         if (snapshots[timestamp] != bytes32(0)) revert AlreadyAnchored();

119:         if (anchor == address(0)) revert ZeroAddress();

```

```solidity
File: src/SponsorReceiptSBT.sol

67:         if (minter == address(0)) revert ZeroAddress();

80:         if (msg.sender != MINTER) revert NotMinter();

81:         if (to == address(0)) revert ZeroAddress();

102:         if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();

117:         if (from != address(0) && to != address(0)) revert TransferLocked();

124:         revert ApprovalLocked();

129:         revert ApprovalLocked();

138:         if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();

```

```solidity
File: src/SponsorshipModule.sol

94:         if (address(usdc) == address(0)) revert ZeroAddress();

95:         if (address(pool) == address(0)) revert ZeroAddress();

96:         if (address(receipt) == address(0)) revert ZeroAddress();

97:         if (address(oracle) == address(0)) revert ZeroAddress();

127:         if (amount == 0) revert ZeroAmount();

128:         if (sanctionsOracle.isSanctioned(msg.sender)) revert SponsorSanctioned();

152:         if (address(newOracle) == address(0)) revert ZeroAddress();

```

```solidity
File: src/TournamentPool.sol

306:         if (address(_usdc) == address(0)) revert ZeroAddress();

307:         if (_trustedSigner == address(0)) revert ZeroAddress();

308:         if (_devNFT == address(0)) revert ZeroAddress();

340:         if (_tournaments[id].sponsor != address(0)) revert TournamentAlreadyExists();

341:         if (devAddr == address(0)) revert ZeroAddress();

342:         if (endsAt <= startsAt) revert InvalidWindow();

343:         if (prizePool == 0) revert ZeroPrize();

390:         if (amount == 0) revert ZeroPrize();

392:         if (t.sponsor == address(0)) revert TournamentNotFound();

393:         if (t.settled) revert TournamentAlreadySettled();

418:         if (t.sponsor == address(0)) revert TournamentNotFound();

419:         if (t.settled) revert TournamentAlreadySettled();

420:         if (block.timestamp < t.startsAt) revert TournamentNotStarted();

421:         if (block.timestamp >= t.endsAt) revert TournamentAlreadyEnded();

422:         if (usedNonces[nonce]) revert NonceUsed();

423:         if (player == address(0)) revert ZeroAddress();

473:         if (t.sponsor == address(0)) revert TournamentNotFound();

474:         if (t.settled) revert TournamentAlreadySettled();

475:         if (block.timestamp < t.startsAt) revert TournamentNotStarted();

476:         if (block.timestamp >= t.endsAt) revert TournamentAlreadyEnded();

477:         if (usedNonces[nonce]) revert NonceUsed();

478:         if (player == address(0)) revert ZeroAddress();

487:             revert InsufficientFeePaid();

525:         if (msg.sender != player) revert PlayerMismatch();

527:         if (t.sponsor == address(0)) revert TournamentNotFound();

528:         if (t.settled) revert TournamentAlreadySettled();

529:         if (block.timestamp < t.startsAt) revert TournamentNotStarted();

530:         if (block.timestamp >= t.endsAt) revert TournamentAlreadyEnded();

548:         if (t.sponsor == address(0)) revert TournamentNotFound();

549:         if (t.settled) revert TournamentAlreadySettled();

550:         if (!isParticipant[id][player]) revert PlayerNotInTournament();

565:         if (t.sponsor == address(0)) revert TournamentNotFound();

566:         if (t.settled) revert TournamentAlreadySettled();

567:         if (block.timestamp < t.endsAt) revert TournamentNotEnded();

570:         if (sortedRanking.length != expectedCount) revert InvalidRankingLength();

592:         if (newSigner == address(0)) revert ZeroAddress();

611:         if (msg.sender != dev) revert OnlyDev();

637:         if (to == address(0)) revert ZeroAddress();

730:         if (signer != trustedSigner) revert BadSignature();

747:         if (signer != trustedSigner) revert BadSignature();

768:             if (!isParticipant[id][p]) revert NotParticipant();

769:             if (excluded[id][p]) revert PlayerExcluded();

770:             if (_seenInRanking[id][p]) revert DuplicateInRanking();

774:             if (sc > prevScore) revert InvalidRankingOrder();

```

### <a name="NC-9"></a>[NC-9] Avoid the use of sensitive terms
Use [alternative variants](https://www.zdnet.com/article/mysql-drops-master-slave-and-blacklist-whitelist-terminology/), e.g. allowlist/denylist instead of whitelist/blacklist

*Instances (6)*:
```solidity
File: src/MockSanctionsOracle.sol

23:     event AddedToBlacklist(address indexed addr);

24:     event RemovedFromBlacklist(address indexed addr);

29:     function addToBlacklist(address addr) external onlyOwner {

32:         emit AddedToBlacklist(addr);

36:     function removeFromBlacklist(address addr) external onlyOwner {

38:         emit RemovedFromBlacklist(addr);

```

### <a name="NC-10"></a>[NC-10] Strings should use double quotes rather than single quotes
See the Solidity Style Guide: https://docs.soliditylang.org/en/v0.8.20/style-guide.html#other-recommendations

*Instances (8)*:
```solidity
File: src/SponsorReceiptSBT.sol

149:             '{"name":"Skillbase Sponsor Receipt #', tokenId.toString(),

150:             '","description":"Soulbound proof of permissionless sponsorship for a Skillbase tournament prize pool.",',

151:             '"attributes":['

154:             '{"trait_type":"Tournament","value":"0x', _toHexString(r.tournamentId), '"},',

155:             '{"trait_type":"Amount (USDC atoms)","value":', r.amount.toString(), '},',

156:             '{"trait_type":"Sponsor","value":"', r.sponsor.toHexString(), '"},',

157:             '{"trait_type":"Minted At","display_type":"date","value":', uint256(r.mintedAt).toString(), '}',

158:             ']}'

```

### <a name="NC-11"></a>[NC-11] Use Underscores for Number Literals (add an underscore every 3 digits)

*Instances (10)*:
```solidity
File: src/ArcadePool.sol

17:     uint256 public protocolFeeBps = 1000; // 10%

117:         uint256 fee = (t.totalPool * protocolFeeBps) / 10000;

147:         require(_bps <= 3000, "Max 30%");

```

```solidity
File: src/ChallengeEscrow.sol

71:     uint256 public constant FEE_BPS = 1000;

```

```solidity
File: src/TournamentPool.sol

176:     uint256 public constant DEV_BPS = 7000;

179:     uint256 public constant PLATFORM_BPS = 3000;

185:     uint256 private constant BPS_PLACE_1 = 2500;

186:     uint256 private constant BPS_PLACE_2 = 1500;

187:     uint256 private constant BPS_PLACE_3 = 1000;

189:     uint256 private constant BPS_TIER5_POOL = 1500;

```

### <a name="NC-12"></a>[NC-12] Constants should be defined rather than using magic numbers

*Instances (1)*:
```solidity
File: src/SponsorReceiptSBT.sol

165:         bytes memory result = new bytes(64);

```

### <a name="NC-13"></a>[NC-13] Variables need not be initialized to zero
The default value for variables is zero, so initializing them to zero is superfluous.

*Instances (3)*:
```solidity
File: src/ArcadePool.sol

131:         for (uint256 i = 0; i < players.length; i++) {

```

```solidity
File: src/SponsorReceiptSBT.sol

166:         for (uint256 i = 0; i < 32; ++i) {

```

```solidity
File: src/TournamentPool.sol

580:         uint256 refunded = 0;

```


## Low Issues


| |Issue|Instances|
|-|:-|:-:|
| [L-1](#L-1) | Use a 2-step ownership transfer pattern | 6 |
| [L-2](#L-2) | Division by zero not prevented | 1 |
| [L-3](#L-3) | Possible rounding issue | 2 |
| [L-4](#L-4) | Loss of precision | 11 |
| [L-5](#L-5) | Use `Ownable2Step.transferOwnership` instead of `Ownable.transferOwnership` | 6 |
### <a name="L-1"></a>[L-1] Use a 2-step ownership transfer pattern
Recommend considering implementing a two step process where the owner or admin nominates an account and the nominated account needs to call an `acceptOwnership()` function for the transfer of ownership to fully succeed. This ensures the nominated EOA account is a valid and active account. Lack of two-step procedure for critical operations leaves them error-prone. Consider adding two step procedure on the critical functions.

*Instances (6)*:
```solidity
File: src/ArcadePool.sol

11: contract ArcadePool is Ownable, ReentrancyGuard, EIP712 {

```

```solidity
File: src/ChallengeEscrow.sol

26: contract ChallengeEscrow is Ownable, ReentrancyGuard {

```

```solidity
File: src/MockSanctionsOracle.sol

18: contract MockSanctionsOracle is Ownable, ISanctionsOracle {

```

```solidity
File: src/SkillbaseAnchor.sol

34: contract SkillbaseAnchor is Ownable, ReentrancyGuard {

```

```solidity
File: src/SponsorshipModule.sol

41: contract SponsorshipModule is Ownable, ReentrancyGuard {

```

```solidity
File: src/TournamentPool.sol

66: contract TournamentPool is Ownable, ReentrancyGuard {

```

### <a name="L-2"></a>[L-2] Division by zero not prevented
The divisions below take an input parameter which does not have any zero-value checks, which may lead to the functions reverting when zero is passed.

*Instances (1)*:
```solidity
File: src/TournamentPool.sol

816:             uint256 perPlaceT5 = tier5Pool / tier5Count;

```

### <a name="L-3"></a>[L-3] Possible rounding issue
Division by large numbers may result in the result being zero, due to solidity not supporting fractions. Consider requiring a minimum amount for the numerator to ensure that it is always larger than the denominator. Also, there is indication of multiplication and division without the use of parenthesis which could result in issues.

*Instances (2)*:
```solidity
File: src/TournamentPool.sol

534:         uint256 devShare = (ENTRY_FEE * DEV_BPS) / TOTAL_BPS;

535:         uint256 platformShare = (ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS;

```

### <a name="L-4"></a>[L-4] Loss of precision
Division by large numbers may result in the result being zero, due to solidity not supporting fractions. Consider requiring a minimum amount for the numerator to ensure that it is always larger than the denominator

*Instances (11)*:
```solidity
File: src/ChallengeEscrow.sol

196:         uint256 fee = (totalPool * FEE_BPS) / BPS_DENOMINATOR;

253:         uint256 fee = (totalPool * FEE_BPS) / BPS_DENOMINATOR;

```

```solidity
File: src/TournamentPool.sol

534:         uint256 devShare = (ENTRY_FEE * DEV_BPS) / TOTAL_BPS;

535:         uint256 platformShare = (ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS;

798:         _pay(id, ranking, 0, (pool * BPS_PLACE_1) / BPS_DENOMINATOR);

799:         _pay(id, ranking, 1, (pool * BPS_PLACE_2) / BPS_DENOMINATOR);

800:         _pay(id, ranking, 2, (pool * BPS_PLACE_3) / BPS_DENOMINATOR);

801:         totalDistributed = (pool * BPS_PLACE_1) / BPS_DENOMINATOR + (pool * BPS_PLACE_2) / BPS_DENOMINATOR

802:             + (pool * BPS_PLACE_3) / BPS_DENOMINATOR;

806:         uint256 perPlace45 = (pool * BPS_PLACES_4_TO_10) / BPS_DENOMINATOR;

815:             uint256 tier5Pool = (pool * BPS_TIER5_POOL) / BPS_DENOMINATOR;

```

### <a name="L-5"></a>[L-5] Use `Ownable2Step.transferOwnership` instead of `Ownable.transferOwnership`
Use [Ownable2Step.transferOwnership](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable2Step.sol) which is safer. Use it as it is more secure due to 2-stage ownership transfer.

**Recommended Mitigation Steps**

Use <a href="https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable2Step.sol">Ownable2Step.sol</a>
  
  ```solidity
      function acceptOwnership() external {
          address sender = _msgSender();
          require(pendingOwner() == sender, "Ownable2Step: caller is not the new owner");
          _transferOwnership(sender);
      }
```

*Instances (6)*:
```solidity
File: src/ArcadePool.sol

6: import "@openzeppelin/contracts/access/Ownable.sol";

```

```solidity
File: src/ChallengeEscrow.sol

7: import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

```

```solidity
File: src/MockSanctionsOracle.sol

4: import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

```

```solidity
File: src/SkillbaseAnchor.sol

4: import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

```

```solidity
File: src/SponsorshipModule.sol

6: import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

```

```solidity
File: src/TournamentPool.sol

7: import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

```


## Medium Issues


| |Issue|Instances|
|-|:-|:-:|
| [M-1](#M-1) | Centralization Risk for trusted owners | 31 |
| [M-2](#M-2) | Direct `supportsInterface()` calls may cause caller to revert | 2 |
### <a name="M-1"></a>[M-1] Centralization Risk for trusted owners

#### Impact:
Contracts have owners with privileged rights to perform admin tasks and need to be trusted to not perform malicious updates or drain funds.

*Instances (31)*:
```solidity
File: src/ArcadePool.sol

11: contract ArcadePool is Ownable, ReentrancyGuard, EIP712 {

49:         Ownable(msg.sender)

144:     function setScoreSigner(address _signer) external onlyOwner { scoreSigner = _signer; }

145:     function setFeeRecipient(address _recipient) external onlyOwner { feeRecipient = _recipient; }

146:     function setProtocolFee(uint256 _bps) external onlyOwner {

```

```solidity
File: src/ChallengeEscrow.sol

7: import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

26: contract ChallengeEscrow is Ownable, ReentrancyGuard {

105:     constructor(IERC20 _usdc, address _trustedSigner, address _feeVault) Ownable(msg.sender) {

271:     function setFeeVault(address newVault) external onlyOwner {

278:     function setTrustedSigner(address newSigner) external onlyOwner {

286:     function emergencyWithdraw(address to) external onlyOwner {

```

```solidity
File: src/DevAttributionNFT.sol

92:         _requireOwned(tokenId);

```

```solidity
File: src/MockSanctionsOracle.sol

4: import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

18: contract MockSanctionsOracle is Ownable, ISanctionsOracle {

26:     constructor() Ownable(msg.sender) {}

29:     function addToBlacklist(address addr) external onlyOwner {

36:     function removeFromBlacklist(address addr) external onlyOwner {

```

```solidity
File: src/SkillbaseAnchor.sol

4: import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

34: contract SkillbaseAnchor is Ownable, ReentrancyGuard {

70:     constructor(address _owner) Ownable(_owner) {

118:     function setAuthorizedAnchor(address anchor, bool authorized) external onlyOwner {

```

```solidity
File: src/SponsorshipModule.sol

6: import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

41: contract SponsorshipModule is Ownable, ReentrancyGuard {

93:     ) Ownable(msg.sender) {

151:     function setSanctionsOracle(ISanctionsOracle newOracle) external onlyOwner {

```

```solidity
File: src/TournamentPool.sol

66: contract TournamentPool is Ownable, ReentrancyGuard {

305:     constructor(IERC20 _usdc, address _trustedSigner, address _devNFT) Ownable(msg.sender) {

546:     function flagScore(bytes32 id, address player) external onlyOwner {

591:     function setTrustedSigner(address newSigner) external onlyOwner {

627:     function withdrawFeesToPlatform(bytes32 id) external onlyOwner nonReentrant {

636:     function emergencyWithdraw(address to) external onlyOwner {

```

### <a name="M-2"></a>[M-2] Direct `supportsInterface()` calls may cause caller to revert
Calling `supportsInterface()` on a contract that doesn't implement the ERC-165 standard will result in the call reverting. Even if the caller does support the function, the contract may be malicious and consume all of the transaction's available gas. Call it via a low-level [staticcall()](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/f959d7e4e6ee0b022b41e5b644c79369869d8411/contracts/utils/introspection/ERC165Checker.sol#L119), with a fixed amount of gas, and check the return code, or use OpenZeppelin's [`ERC165Checker.supportsInterface()`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/f959d7e4e6ee0b022b41e5b644c79369869d8411/contracts/utils/introspection/ERC165Checker.sol#L36-L39).

*Instances (2)*:
```solidity
File: src/DevAttributionNFT.sol

111:         return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);

```

```solidity
File: src/SponsorReceiptSBT.sol

108:         return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);

```

