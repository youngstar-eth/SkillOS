export interface Upgrade {
  id: string;
  name: string;
  description: string;
  /** Cost for the first unit. */
  baseCost: number;
  /** Geometric cost ramp per unit owned — classic Cookie Clicker uses 1.15. */
  costMultiplier: number;
  /** Passive leaves/sec added by ONE unit. */
  leavesPerSecond: number;
  /**
   * If set, each owned unit MULTIPLIES leavesPerClick by this factor.
   * Treated as a separate upgrade class from LPS producers.
   */
  clickMultiplier?: number;
  /** How many units the player currently owns. */
  owned: number;
  /** Visual identifier, rendered as an emoji. */
  icon: string;
  /** Optional cap on how many can be bought (used for click multipliers). */
  maxOwned?: number;
}

export type GameStatus = "playing" | "finished";

export interface ClickerState {
  /** Floating-point count — integer floor only when rendering. */
  leaves: number;
  totalClicks: number;
  totalLeavesEarned: number;
  /** Derived sum over upgrades; cached in state so the UI doesn't recompute. */
  leavesPerSecond: number;
  /** Derived product over clickMultiplier upgrades × BASE_LEAVES_PER_CLICK. */
  leavesPerClick: number;
  upgrades: Upgrade[];
  startedAt: number;
  elapsedMs: number;
  durationMs: number;
  status: GameStatus;
  seed: number;
}
