import type { ClickerState, Upgrade } from "./types";

export const MATCH_DURATION_MS = 5 * 60 * 1000; // 5-minute tournament round
export const BASE_LEAVES_PER_CLICK = 1;

/**
 * Upgrade catalogue. Seven passive producers on a Cookie-Clicker-style
 * exponential cost curve, plus one click-multiplier tier ("wind") capped
 * at 5 purchases. LPS values grow ~5–7× per tier to keep each upgrade
 * relevant for a window before the next one takes over.
 */
export const INITIAL_UPGRADES: readonly Upgrade[] = [
  {
    id: "seedling",
    name: "Seedling",
    description: "A tiny sprout that grows leaves",
    baseCost: 10,
    costMultiplier: 1.15,
    leavesPerSecond: 0.2,
    owned: 0,
    icon: "🌱",
  },
  {
    id: "sapling",
    name: "Sapling",
    description: "Young tree, steady growth",
    baseCost: 100,
    costMultiplier: 1.15,
    leavesPerSecond: 1,
    owned: 0,
    icon: "🌿",
  },
  {
    id: "tree",
    name: "Tree",
    description: "Full-grown, reliable producer",
    baseCost: 1_100,
    costMultiplier: 1.15,
    leavesPerSecond: 8,
    owned: 0,
    icon: "🌳",
  },
  {
    id: "grove",
    name: "Grove",
    description: "Cluster of trees",
    baseCost: 12_000,
    costMultiplier: 1.15,
    leavesPerSecond: 47,
    owned: 0,
    icon: "🌲",
  },
  {
    id: "forest",
    name: "Forest",
    description: "Vast woodland ecosystem",
    baseCost: 130_000,
    costMultiplier: 1.15,
    leavesPerSecond: 260,
    owned: 0,
    icon: "🏞️",
  },
  {
    id: "mycelium",
    name: "Mycelium Network",
    description: "Invisible fungal networks boost all trees",
    baseCost: 1_400_000,
    costMultiplier: 1.15,
    leavesPerSecond: 1_400,
    owned: 0,
    icon: "🍄",
  },
  {
    id: "ancient",
    name: "Ancient Tree",
    description: "Thousands of years old",
    baseCost: 20_000_000,
    costMultiplier: 1.15,
    leavesPerSecond: 7_800,
    owned: 0,
    icon: "🌴",
  },
  {
    id: "wind",
    name: "Breeze Blessing",
    description: "2× leaves per click (max 5)",
    baseCost: 50,
    costMultiplier: 3, // rare, scales steeply on purpose
    leavesPerSecond: 0,
    clickMultiplier: 2,
    owned: 0,
    maxOwned: 5,
    icon: "🍃",
  },
];

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export function createInitialState(seed: number): ClickerState {
  return {
    leaves: 0,
    totalClicks: 0,
    totalLeavesEarned: 0,
    leavesPerSecond: 0,
    leavesPerClick: BASE_LEAVES_PER_CLICK,
    upgrades: INITIAL_UPGRADES.map((u) => ({ ...u })),
    startedAt: Date.now(),
    elapsedMs: 0,
    durationMs: MATCH_DURATION_MS,
    status: "playing",
    seed,
  };
}

/** Price of the NEXT copy of this upgrade given how many are owned. */
export function getUpgradeCost(upgrade: Upgrade): number {
  return Math.ceil(
    upgrade.baseCost * Math.pow(upgrade.costMultiplier, upgrade.owned),
  );
}

/** One manual click — grants leavesPerClick, increments totals. */
export function click(state: ClickerState): ClickerState {
  if (state.status !== "playing") return state;
  return {
    ...state,
    leaves: state.leaves + state.leavesPerClick,
    totalClicks: state.totalClicks + 1,
    totalLeavesEarned: state.totalLeavesEarned + state.leavesPerClick,
  };
}

/** Recompute derived LPS / LPC after an upgrade purchase. */
function recomputeDerived(upgrades: Upgrade[]): {
  leavesPerSecond: number;
  leavesPerClick: number;
} {
  let lps = 0;
  let lpc = BASE_LEAVES_PER_CLICK;
  for (const u of upgrades) {
    lps += u.leavesPerSecond * u.owned;
    if (u.clickMultiplier && u.owned > 0) {
      lpc *= Math.pow(u.clickMultiplier, u.owned);
    }
  }
  return { leavesPerSecond: lps, leavesPerClick: lpc };
}

/**
 * Buy one copy of an upgrade. No-op if:
 *   - game over,
 *   - id doesn't match,
 *   - player can't afford the NEXT unit, or
 *   - upgrade has a `maxOwned` cap and it's already reached.
 */
export function buyUpgrade(
  state: ClickerState,
  upgradeId: string,
): ClickerState {
  if (state.status !== "playing") return state;
  const upgrade = state.upgrades.find((u) => u.id === upgradeId);
  if (!upgrade) return state;
  if (upgrade.maxOwned !== undefined && upgrade.owned >= upgrade.maxOwned) {
    return state;
  }
  const cost = getUpgradeCost(upgrade);
  if (state.leaves < cost) return state;

  const newUpgrades = state.upgrades.map((u) =>
    u.id === upgradeId ? { ...u, owned: u.owned + 1 } : u,
  );
  const derived = recomputeDerived(newUpgrades);

  return {
    ...state,
    leaves: state.leaves - cost,
    upgrades: newUpgrades,
    leavesPerSecond: derived.leavesPerSecond,
    leavesPerClick: derived.leavesPerClick,
  };
}

/**
 * Advance the world by `dt` ms. Credits passive leaves (`LPS × dt/1000`),
 * tracks elapsed time, and flips to `finished` when the clock expires.
 */
export function tick(state: ClickerState, dt: number): ClickerState {
  if (state.status !== "playing") return state;
  const dtSeconds = dt / 1000;
  const passive = state.leavesPerSecond * dtSeconds;
  const nextElapsed = state.elapsedMs + dt;

  if (nextElapsed >= state.durationMs) {
    // Pro-rate the final tick so scores don't overshoot the time limit.
    const remainMs = state.durationMs - state.elapsedMs;
    const finalPassive = state.leavesPerSecond * (Math.max(0, remainMs) / 1000);
    return {
      ...state,
      leaves: state.leaves + finalPassive,
      totalLeavesEarned: state.totalLeavesEarned + finalPassive,
      elapsedMs: state.durationMs,
      status: "finished",
    };
  }

  return {
    ...state,
    leaves: state.leaves + passive,
    totalLeavesEarned: state.totalLeavesEarned + passive,
    elapsedMs: nextElapsed,
  };
}

/**
 * Log-scale score so a player earning 10× as many leaves doesn't finish
 * with 10× the leaderboard points. Idle-game economies grow exponentially;
 * linear score would crown whoever sneaks one extra Ancient Tree purchase
 * in the final seconds. Formula: floor(log10(earned + 1) × 1000).
 *   1 leaf    → 300
 *   1K       → 3000
 *   1M       → 6000
 *   1B       → 9000
 */
export function calculateScore(state: ClickerState): number {
  if (state.totalLeavesEarned < 1) return 0;
  return Math.floor(Math.log10(state.totalLeavesEarned + 1) * 1000);
}
