/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GRID_COLS,
  GRID_ROWS,
  INITIAL_GOLD,
  INITIAL_LIVES,
  TOWER_COST,
  WAVES_TOTAL,
  calculateScore,
  createInitialState,
  placeTower,
  startWave,
  tick,
} from "./engine";
import type { TowerDefenseState } from "./types";

describe("createInitialState", () => {
  it("builds a 10x10 grid with path tiles marked", () => {
    const s = createInitialState(1);
    assert.equal(s.grid.length, GRID_ROWS);
    assert.equal(s.grid[0].length, GRID_COLS);
    assert.equal(s.lives, INITIAL_LIVES);
    assert.equal(s.gold, INITIAL_GOLD);
    assert.equal(s.status, "playing");
    // First waypoint [0, 2] is on path
    assert.equal(s.grid[2][0], "path");
    // Last waypoint [9, 2] is on path
    assert.equal(s.grid[2][9], "path");
    // A non-path tile (0,0) is placeable
    assert.equal(s.grid[0][0], "placeable");
  });
});

describe("placeTower", () => {
  it("places on a placeable tile and deducts gold", () => {
    const s = createInitialState(1);
    const next = placeTower(s, 0, 0, "arrow")!;
    assert.ok(next);
    assert.equal(next.towers.length, 1);
    assert.equal(next.towers[0].x, 0);
    assert.equal(next.towers[0].y, 0);
    assert.equal(next.gold, INITIAL_GOLD - TOWER_COST.arrow);
  });

  it("returns null when placed on path", () => {
    const s = createInitialState(1);
    // [0,2] is on the path
    const next = placeTower(s, 0, 2, "arrow");
    assert.equal(next, null);
  });

  it("returns null when gold is insufficient", () => {
    const base = createInitialState(1);
    const broke: TowerDefenseState = { ...base, gold: 10 };
    const next = placeTower(broke, 0, 0, "cannon");
    assert.equal(next, null);
  });

  it("returns null when overlapping existing tower", () => {
    const s = createInitialState(1);
    const first = placeTower(s, 0, 0, "arrow")!;
    const dupe = placeTower(first, 0, 0, "arrow");
    assert.equal(dupe, null);
  });
});

describe("startWave", () => {
  it("increments wave and sets enemies remaining", () => {
    const s = createInitialState(1);
    const next = startWave(s);
    assert.equal(next.wave, 1);
    assert.equal(next.waveEnemiesRemaining, 7); // 5 + 1*2
  });
});

describe("tick: spawn & movement", () => {
  it("spawns an enemy once the spawn timer elapses", () => {
    const s = startWave(createInitialState(1));
    const next = tick(s, 16);
    assert.equal(next.enemies.length, 1);
    assert.equal(next.waveEnemiesRemaining, 6);
  });

  it("moves enemy along the path", () => {
    let s = startWave(createInitialState(1));
    s = tick(s, 16); // spawn
    const before = s.enemies[0];
    // Advance 500ms; enemy moves but should still be on segment 0
    const after = tick(s, 500);
    const enemyAfter = after.enemies[0];
    assert.ok(enemyAfter.t > before.t || enemyAfter.pathIndex > before.pathIndex);
  });

  it("decrements lives when enemy reaches end", () => {
    // Hand-craft a state with a single enemy already at the last segment.
    const base = createInitialState(1);
    const rigged: TowerDefenseState = {
      ...base,
      wave: 1,
      waveEnemiesRemaining: 0,
      waveSpawnTimer: 9999,
      enemies: [
        {
          id: "test",
          type: "grunt",
          pathIndex: base.path.length - 2,
          t: 0.99,
          hp: 10,
          maxHp: 50,
          speed: 1.2,
          reward: 10,
        },
      ],
    };
    // dt large enough that t crosses 1
    const next = tick(rigged, 1000);
    assert.equal(next.enemies.length, 0);
    assert.equal(next.lives, INITIAL_LIVES - 1);
  });
});

describe("tick: towers fire", () => {
  it("damages an in-range enemy and rewards gold/score on kill", () => {
    const base = createInitialState(1);
    // Place an arrow tower next to the start of the path: col 0, row 1.
    const withTower: TowerDefenseState = {
      ...base,
      towers: [
        {
          x: 0,
          y: 1,
          type: "arrow",
          cooldownMs: 0,
          range: 999,
          damage: 5,
          fireRateMs: 800,
        },
      ],
      enemies: [
        {
          id: "target",
          type: "grunt",
          pathIndex: 0,
          t: 0.1,
          hp: 5,
          maxHp: 50,
          speed: 1.2,
          reward: 10,
        },
      ],
      wave: 1,
      waveEnemiesRemaining: 0,
      waveSpawnTimer: 9999,
    };
    const next = tick(withTower, 16);
    assert.equal(next.enemies.length, 0); // killed
    assert.equal(next.gold, INITIAL_GOLD + 10);
    assert.equal(next.score, 20); // reward * 2
  });

  it("flips to gameOver when lives reaches 0", () => {
    const base = createInitialState(1);
    const rigged: TowerDefenseState = {
      ...base,
      lives: 1,
      wave: 1,
      waveEnemiesRemaining: 0,
      waveSpawnTimer: 9999,
      enemies: [
        {
          id: "breaker",
          type: "grunt",
          pathIndex: base.path.length - 2,
          t: 0.99,
          hp: 10,
          maxHp: 50,
          speed: 1.2,
          reward: 10,
        },
      ],
    };
    const next = tick(rigged, 1000);
    assert.equal(next.lives, 0);
    assert.equal(next.status, "gameOver");
  });
});

describe("tick: winning & scoring", () => {
  it("flips to won after final wave cleared", () => {
    const base = createInitialState(1);
    const rigged: TowerDefenseState = {
      ...base,
      wave: WAVES_TOTAL,
      waveEnemiesRemaining: 0,
      waveSpawnTimer: 9999,
      enemies: [],
    };
    const next = tick(rigged, 16);
    assert.equal(next.status, "won");
  });

  it("calculateScore adds win, lives, wave bonuses", () => {
    const base = createInitialState(1);
    const s: TowerDefenseState = {
      ...base,
      status: "won",
      score: 100,
      lives: 15,
      wave: 10,
    };
    // 100 + 1000 win + 15*10 lives + 10*50 wave = 1750
    assert.equal(calculateScore(s), 1750);
  });
});
