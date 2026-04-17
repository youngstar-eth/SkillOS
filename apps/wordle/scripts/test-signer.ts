/**
 * Smoke test for the EIP-712 score signer.
 *
 *   SCORE_SIGNER_PRIVATE_KEY=0x...01 npx tsx scripts/test-signer.ts
 *
 * Signs a known payload, recovers the address via viem.verifyTypedData,
 * and asserts the signer address is the one derived from the private key.
 */
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import {
  signScore,
  verifyScoreSignature,
  uuidToNonce,
} from "@mas/shared/api";

async function main() {
  const pk =
    (process.env.SCORE_SIGNER_PRIVATE_KEY as Hex | undefined) ??
    ("0x0000000000000000000000000000000000000000000000000000000000000001" as Hex);
  process.env.SCORE_SIGNER_PRIVATE_KEY = pk;

  const expectedSigner = privateKeyToAccount(pk).address;
  const sessionId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const contract: Address = "0x000000000000000000000000000000000000dead";
  const player: Address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const chainId = 84532;

  const out = await signScore({
    sessionId,
    tournamentId: 42n,
    player,
    score: 2048n,
    chainId,
    contract,
  });

  console.log("signer  ", out.signer);
  console.log("expected", expectedSigner);
  console.log("nonce   ", out.nonce.toString(16));
  console.log("uuid→n  ", uuidToNonce(sessionId).toString(16));
  console.log("sig     ", out.signature.slice(0, 18) + "…");

  if (out.signer.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new Error("signer address mismatch");
  }
  if (out.nonce !== uuidToNonce(sessionId)) {
    throw new Error("nonce derivation mismatch");
  }

  const ok = await verifyScoreSignature({
    signer: out.signer,
    chainId,
    contract,
    message: out.message,
    signature: out.signature,
  });
  if (!ok) throw new Error("verifyTypedData returned false");

  // Tamper: flipping one bit in the score must break verification.
  const tampered = await verifyScoreSignature({
    signer: out.signer,
    chainId,
    contract,
    message: { ...out.message, score: 2049n },
    signature: out.signature,
  });
  if (tampered) throw new Error("tampered payload still verified — bad sign");

  console.log("\nOK — sign round-trips, tampering rejected.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
