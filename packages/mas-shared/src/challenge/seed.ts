import { keccak256, toHex } from "viem";
import type { ChallengeSeedData } from "./types";

/**
 * Deterministic seed generator. Same (challengeId, createdAt, gameSlug) →
 * same seed, always. Decoupled from daily_challenges so two challenges
 * created in the same day on the same game don't share the puzzle.
 *
 * Game-specific shape:
 *   - wordle:     { word: 5 uppercase letters from the WORDS list }
 *   - 2048:       { startingTiles: 2 random 2/4 tiles on the 4x4 grid }
 *   - hillclimb:  { seed: 24-bit terrain seed }
 *
 * All games consume this via a `seedOverride` prop on their Game.tsx.
 */

/** Minimal 5-letter word list — short so the bundle stays tiny. Extend later. */
const WORDLE_POOL = [
  "SKILL", "BEATS", "BRAIN", "CROWN", "DAILY",
  "EVENT", "FLAME", "GHOST", "HONEY", "ICICLE".slice(0, 5),
  "JOLLY", "KNIFE", "LEMON", "MAGIC", "NIGHT",
  "OCEAN", "PEARL", "QUEST", "ROBIN", "SMART",
  "TIGER", "UNITE", "VIVID", "WALTZ", "XENON",
  "YACHT", "ZEBRA", "ALBUM", "BLUSH", "CRISP",
  "DRAFT", "EAGER", "FLUTE", "GLOBE", "HIKER",
];

function hashNumber(challengeId: string, createdAt: string, tag: string): number {
  // keccak(tag || challengeId || createdAt) → first 4 bytes → uint32
  const digest = keccak256(toHex(`${tag}:${challengeId}:${createdAt}`));
  return Number(BigInt(digest.slice(0, 10))); // 0x + 8 hex = 32 bits
}

export function generateChallengeSeed(
  gameSlug: string,
  challengeId: string,
  createdAt: string,
): ChallengeSeedData {
  const h = hashNumber(challengeId, createdAt, gameSlug);

  switch (gameSlug) {
    case "wordle": {
      const word = WORDLE_POOL[h % WORDLE_POOL.length] ?? "SMART";
      return { word };
    }
    case "2048": {
      // Two starting tiles — always 2 (not 4) for a fair baseline.
      const h2 = hashNumber(challengeId, createdAt, "2048:pos2");
      const first = { row: (h >>> 4) % 4, col: h % 4, value: 2 as const };
      let second = {
        row: (h2 >>> 4) % 4,
        col: h2 % 4,
        value: 2 as const,
      };
      if (second.row === first.row && second.col === first.col) {
        second = { row: (second.row + 1) % 4, col: second.col, value: 2 };
      }
      return { startingTiles: [first, second] };
    }
    case "hillclimb": {
      return { seed: h & 0xffffff };
    }
    default:
      throw new Error(`unsupported game for challenge seed: ${gameSlug}`);
  }
}
