import { gameSlug } from './contracts-vendored/game-slug.js';

// Known game slugs in the SkillOS monorepo. The on-chain `game` field is
// keccak256(utf8(name)) — irreversible — so we maintain a static reverse map
// and fall back to the raw hex when a slug isn't in this list.
const KNOWN_GAMES = [
  '2048',
  'wordle',
  'sudoku',
  'minesweeper',
  'clicker',
  'match3',
] as const;

const SLUG_TO_NAME = new Map<string, string>(
  KNOWN_GAMES.map((name) => [gameSlug(name).toLowerCase(), name]),
);

export const decodeGame = (bytes32: `0x${string}`): string =>
  SLUG_TO_NAME.get(bytes32.toLowerCase()) ?? bytes32;
