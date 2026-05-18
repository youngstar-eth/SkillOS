// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ERC-6492 signature wrapper detection and unwrap
/// @notice Per EIP-6492, counterfactual smart-wallet signatures are wrapped with
///         a magic-bytes suffix `0x6492...6492` and carry the deployment data
///         (factory + factoryCalldata) needed to bring the wallet into existence
///         before validating its ERC-1271 signature. This library detects the
///         wrapper and decodes the three payload fields so the caller can
///         simulate the deploy (off-chain via `eth_call`) then verify via
///         ERC-1271 isValidSignature on the (now-virtually-deployed) wallet.
/// @dev    Inline helper — no canonical Solidity reference library exists in the
///         monorepo's vendored deps (lib/openzeppelin-contracts only). Per
///         X11.0 SPEC §K Q2 option (ii). The audit firm reviews this surface
///         against the EIP-6492 spec text directly.
library ERC6492 {
    /// @notice Trailing 32-byte suffix that marks a signature as ERC-6492 wrapped.
    /// @dev    Per EIP-6492: bytes32(0x6492649264926492649264926492649264926492649264926492649264926492).
    bytes32 internal constant MAGIC =
        0x6492649264926492649264926492649264926492649264926492649264926492;

    /// @notice True iff `signature` ends with the ERC-6492 magic suffix.
    /// @dev    Returns false (not reverts) for any signature shorter than 32
    ///         bytes — a wrapped signature is always longer than just the
    ///         suffix (it must contain at least a `bytes` triple before it).
    function isWrapped(bytes calldata signature) internal pure returns (bool) {
        if (signature.length < 32) return false;
        bytes32 last32 = bytes32(signature[signature.length - 32:]);
        return last32 == MAGIC;
    }

    /// @notice Decode an ERC-6492-wrapped signature into its three component fields.
    /// @dev    Caller MUST first verify `isWrapped(signature) == true`; otherwise
    ///         the abi.decode call reverts with unspecified data.
    ///         Payload encoding per EIP-6492:
    ///           wrappedSig = abi.encode(factory, factoryCalldata, innerSignature) || MAGIC
    ///         The trailing 32 bytes are sliced off before abi.decode.
    /// @param  signature       ERC-6492-wrapped signature (with magic suffix).
    /// @return factory         Smart-wallet factory address.
    /// @return factoryCalldata Calldata for the factory's deploy call (e.g. `createAccount(...)`).
    /// @return innerSignature  The ERC-1271 signature the deployed wallet will validate.
    function unwrap(bytes calldata signature)
        internal
        pure
        returns (address factory, bytes memory factoryCalldata, bytes memory innerSignature)
    {
        bytes calldata payload = signature[:signature.length - 32];
        (factory, factoryCalldata, innerSignature) = abi.decode(payload, (address, bytes, bytes));
    }
}
