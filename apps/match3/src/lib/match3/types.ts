export type GemColor =
  | "red"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink";

export interface Cell {
  color: GemColor | null;
  /** Stable per-instance id so React keys survive gravity drops. */
  id: string;
}

/**
 * `playing`   — idle, awaiting a swap
 * `resolving` — cascade resolution is mid-flight (engine runs it to
 *               completion synchronously; this state is transient but
 *               exposed so the UI can freeze input)
 *
 * Note: legacy had a `gameOver` terminal state bound to a 30-move limit.
 * The duel is time-boxed by the shared 2-minute Timer instead, so the
 * engine here never transitions to `gameOver` on its own — finalization
 * lives in duel/[id]'s handleTimerExpire.
 */
export type GameStatus = "playing" | "resolving";

export interface Match3State {
  grid: Cell[][];
  rows: number;
  cols: number;
  /** Accumulator — every cascade chain adds to this. */
  score: number;
  /** Current cascade depth (reset to 0 after resolve completes). */
  combo: number;
  /** Deepest cascade chain ever hit — informational, not scored separately. */
  maxCombo: number;
  /** Total matched cells across all chains. */
  totalMatches: number;
  selected: [number, number] | null;
  status: GameStatus;
  /** Folded from the bytes32 match seed at createInitialState time. */
  seed: number;
  /** Current RNG state — threaded through swaps for deterministic refills. */
  rng: number;
}

export const ROWS = 8 as const;
export const COLS = 8 as const;
export const COLORS: readonly GemColor[] = [
  "red",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
];
