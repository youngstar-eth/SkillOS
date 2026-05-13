import type { Game } from '../lib/wallet.js';
import { generateScore as wordle } from './wordle.js';
import { generateScore as sudoku } from './sudoku.js';
import { generateScore as match3 } from './match3.js';
import { generateScore as minesweeper } from './minesweeper.js';
import { generateScore as clicker } from './clicker.js';

export interface ScoringResult {
  score: number;
  metadata: {
    seed: string;
    duration_ms: number;
    version: string;
  };
}

const SCORERS: Record<Game, (seed: bigint) => ScoringResult> = {
  wordle,
  sudoku,
  match3,
  minesweeper,
  clicker,
};

const DAY_SECONDS = 86400;

// Seed formula: BigInt(UTC midnight of `atMs`) XOR BigInt(agentAddress).
// Game-locked identity (one agent per game) means the address alone provides
// per-game divergence — no need to mix the game name into the seed.
export function dailySeed(
  agentAddress: `0x${string}`,
  atMs: number = Date.now(),
): bigint {
  const dayEpochSec = Math.floor(atMs / 1000 / DAY_SECONDS) * DAY_SECONDS;
  return BigInt(dayEpochSec) ^ BigInt(agentAddress);
}

export function generateScoreFor(game: Game, seed: bigint): ScoringResult {
  return SCORERS[game](seed);
}
