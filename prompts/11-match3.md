
OYUN: Match-3
TOURNAMENT ID: 10
PORT: 3010
WORKTREE: /Users/inancayvaz/MAS-match3
BRANCH: game/match3
DESIGN: Kidcore (Neopets — doygun renkler, yuvarlak)

═══ ADIM 0: TEMPLATE ═══

cd /Users/inancayvaz/MAS-match3
cp -r templates/game apps/match3
cd apps/match3
grep -rl __GAME_NAME__ . | xargs sed -i '' 's/__GAME_NAME__/match3/g'
grep -rl __GAME_TITLE__ . | xargs sed -i '' 's/__GAME_TITLE__/Match 3/g'
grep -rl __PORT__ . | xargs sed -i '' 's/__PORT__/3010/g'
cd /Users/inancayvaz/MAS-match3 && npm install

═══ ADIM 1: ENGINE ═══

types.ts:

export type GemColor = 'red' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink'

export interface Cell {
  color: GemColor | null
  id: string  // animation için unique id
}

export interface Match3State {
  grid: Cell[][]       // 8×8
  rows: number
  cols: number
  score: number
  movesLeft: number    // 30 başlangıç
  combo: number        // cascade chain
  maxCombo: number
  totalMatches: number
  gemsPopped: number
  selected: [number, number] | null
  status: 'playing' | 'resolving' | 'gameOver'
  seed: number
  rng: number           // stateful rng for spawns
}

engine.ts:

import { seededRandom } from '@mas/shared/game'

export const ROWS = 8
export const COLS = 8
export const COLORS: GemColor[] = ['red', 'yellow', 'green', 'blue', 'purple', 'pink']
export const INITIAL_MOVES = 30

// Kendi stateful RNG (seed ilerlemeli)
function randColor(state: Match3State): { color: GemColor; newRng: number } {
  const newRng = Math.imul(state.rng, 2654435761) >>> 0
  return { color: COLORS[newRng % COLORS.length], newRng }
}

export function createInitialState(seed: number): Match3State {
  let rng = seed || 1
  const grid: Cell[][] = []
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = []
    for (let c = 0; c < COLS; c++) {
      // İlk grid'de match olmaması için loop
      let color: GemColor
      let attempts = 0
      do {
        rng = Math.imul(rng, 2654435761) >>> 0
        color = COLORS[rng % COLORS.length]
        attempts++
        if (attempts > 20) break
      } while (
        (c >= 2 && row[c-1].color === color && row[c-2].color === color) ||
        (r >= 2 && grid[r-1][c].color === color && grid[r-2][c].color === color)
      )
      row.push({ color, id: `${r}-${c}-0` })
    }
    grid.push(row)
  }
  return {
    grid, rows: ROWS, cols: COLS,
    score: 0, movesLeft: INITIAL_MOVES,
    combo: 0, maxCombo: 0,
    totalMatches: 0, gemsPopped: 0,
    selected: null,
    status: 'playing',
    seed, rng,
  }
}

export function areAdjacent(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1
}

export function swap(state: Match3State, a: [number, number], b: [number, number]): Match3State | null {
  if (state.status !== 'playing') return null
  if (!areAdjacent(a, b)) return null
  const newGrid = state.grid.map(row => row.map(c => ({ ...c })))
  const temp = newGrid[a[0]][a[1]]
  newGrid[a[0]][a[1]] = newGrid[b[0]][b[1]]
  newGrid[b[0]][b[1]] = temp
  // Swap sadece match oluşturuyorsa geçerli
  const matches = findMatches(newGrid)
  if (matches.size === 0) return null  // invalid swap
  return {
    ...state,
    grid: newGrid,
    movesLeft: state.movesLeft - 1,
    selected: null,
    status: 'resolving',
  }
}

export function findMatches(grid: Cell[][]): Set<string> {
  const matches = new Set<string>()
  // Horizontal
  for (let r = 0; r < grid.length; r++) {
    let streak = 1
    for (let c = 1; c < grid[r].length; c++) {
      if (grid[r][c].color && grid[r][c].color === grid[r][c-1].color) {
        streak++
      } else {
        if (streak >= 3) {
          for (let k = c - streak; k < c; k++) matches.add(`${r},${k}`)
        }
        streak = 1
      }
    }
    if (streak >= 3) {
      for (let k = grid[r].length - streak; k < grid[r].length; k++) matches.add(`${r},${k}`)
    }
  }
  // Vertical
  for (let c = 0; c < grid[0].length; c++) {
    let streak = 1
    for (let r = 1; r < grid.length; r++) {
      if (grid[r][c].color && grid[r][c].color === grid[r-1][c].color) {
        streak++
      } else {
        if (streak >= 3) {
          for (let k = r - streak; k < r; k++) matches.add(`${k},${c}`)
        }
        streak = 1
      }
    }
    if (streak >= 3) {
      for (let k = grid.length - streak; k < grid.length; k++) matches.add(`${k},${c}`)
    }
  }
  return matches
}

export function resolve(state: Match3State): Match3State {
  if (state.status !== 'resolving') return state
  let current = state
  let chainLen = 0
  while (true) {
    const matches = findMatches(current.grid)
    if (matches.size === 0) break
    chainLen++
    const grid = current.grid.map(row => row.map(c => ({ ...c })))
    // Pop matched
    for (const key of matches) {
      const [r, c] = key.split(',').map(Number)
      grid[r][c].color = null
    }
    const scoreDelta = matches.size * 10 * chainLen
    // Gravity: null'lar yukarı, kartlar düşer
    let rng = current.rng
    for (let c = 0; c < current.cols; c++) {
      const column: (GemColor | null)[] = []
      for (let r = 0; r < current.rows; r++) {
        if (grid[r][c].color !== null) column.push(grid[r][c].color)
      }
      // Eksikleri yeni renklerle doldur
      while (column.length < current.rows) {
        rng = Math.imul(rng, 2654435761) >>> 0
        column.unshift(COLORS[rng % COLORS.length])
      }
      for (let r = 0; r < current.rows; r++) {
        grid[r][c] = { color: column[r], id: `${r}-${c}-${Date.now()}-${Math.random()}` }
      }
    }
    current = {
      ...current,
      grid, rng,
      score: current.score + scoreDelta,
      combo: chainLen,
      maxCombo: Math.max(current.maxCombo, chainLen),
      totalMatches: current.totalMatches + matches.size,
      gemsPopped: current.gemsPopped + matches.size,
    }
  }
  const newStatus = current.movesLeft <= 0 ? 'gameOver' : 'playing'
  return { ...current, status: newStatus, combo: 0 }
}

export function calculateScore(state: Match3State): number {
  return state.score + state.maxCombo * 50
}

═══ ADIM 2: TESTLER (minimum 18) ═══

createInitialState: 8×8, no initial matches
createInitialState: determinism
areAdjacent: 4-dir yes, diagonal no
swap: non-adjacent → null
swap: adjacent but no match → null
swap: valid (creates horizontal 3) → new state
findMatches: horizontal 3
findMatches: horizontal 4 (4 cells)
findMatches: vertical 3
findMatches: L-shape (5 cells)
findMatches: no match → empty
resolve: pops matches
resolve: gravity (null → top)
resolve: new gems spawn
resolve: cascade (pop creates new match → chain)
resolve: combo tracks chain length
movesLeft decrement on swap
gameOver when movesLeft === 0

═══ ADIM 3: UI ═══

components/game/Gem.tsx:
  props: color, isSelected, onClick
  Colored rounded square (64px), gradient + highlight
  Hover scale 1.05, selected ring + pulse
  Clicked twice = deselect

components/game/Board.tsx:
  CSS Grid 8×8
  Click cell 1 → select
  Click cell 2 adjacent → swap attempt
  Click cell 2 non-adjacent → deselect + new select

components/game/Game.tsx:
  useState(Match3State)
  After swap: setTimeout(resolve, 300) for cascade anim
  useEffect: if status='resolving' → resolve()
  Keyboard arrows for selection (bonus)
  GameOverSubmit with {score, moves, maxCombo, popped} stats
  Tournament ID: 10n

═══ ADIM 4: DESIGN — Kidcore ═══

:root {
  --color-bg: 255 250 235;
  --color-fg: 68 40 80;
  --color-surface: 255 255 255;
  --color-border: 240 180 220;
  --color-accent: 255 120 180;
  --color-muted: 140 120 140;
  --color-gem-red: 255 90 100;
  --color-gem-yellow: 255 210 60;
  --color-gem-green: 80 200 120;
  --color-gem-blue: 90 170 255;
  --color-gem-purple: 180 110 230;
  --color-gem-pink: 255 140 200;
  --font-primary: 'Fredoka', 'Nunito', sans-serif;
  --font-display: 'Baloo 2', 'Fredoka', cursive;
}

body {
  background:
    radial-gradient(at 10% 20%, rgba(255,180,220,0.3), transparent),
    radial-gradient(at 90% 80%, rgba(180,220,255,0.3), transparent),
    rgb(var(--color-bg));
  color: rgb(var(--color-fg));
  font-family: var(--font-primary);
}

.gem {
  border-radius: 20%;
  background: radial-gradient(at 30% 30%, white, rgb(var(--gem-color)));
  box-shadow: 0 4px 8px rgba(0,0,0,0.15), inset 0 2px 4px white;
  transition: transform 0.15s;
}
.gem:hover { transform: scale(1.05); }
.gem.selected {
  box-shadow: 0 0 0 4px rgb(var(--color-accent)), 0 4px 12px rgba(255,120,180,0.4);
  animation: pulse 0.8s ease-in-out infinite;
}
@keyframes pulse { 50% { transform: scale(1.08); } }

═══ ADIM 5: DOĞRULAMA ═══

tsc --noEmit, 18+ tests, build clean

═══ ADIM 6: COMMIT ═══

git commit -m "feat: add match3 game (tournament ID 10)"
