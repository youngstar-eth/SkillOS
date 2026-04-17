# Flappy — MAS game template

## Bootstrap a new game

```bash
# 1. Copy template to apps/
cp -r templates/game apps/NEW_GAME
cd apps/NEW_GAME

# 2. Replace placeholders (macOS: sed -i '' ...; Linux: sed -i ...)
GAME_NAME="NEW_GAME"       # kebab/snake case, used for gameId
GAME_TITLE="New Game"      # display name
PORT="3009"                # next free port (2048=3000 ... bubble=3008)

grep -rl flappy . | xargs sed -i '' "s/flappy/${GAME_NAME}/g"
grep -rl Flappy . | xargs sed -i '' "s/Flappy/${GAME_TITLE}/g"
grep -rl 3011 . | xargs sed -i '' "s/3011/${PORT}/g"

# 3. Install workspace link (from repo root)
cd ../.. && npm install

# 4. Create the tournament on-chain and bump TOURNAMENT_ID in
#    components/game/Game.tsx to match the returned id.
cast send "$ARCADE_POOL_ADDRESS" \
  "createTournament(bytes32,uint256,uint256)" \
  "$(cast format-bytes32-string "${GAME_NAME}")" \
  1000000 86400 \
  --rpc-url https://sepolia.base.org \
  --private-key "$DEPLOYER_PRIVATE_KEY"
```

## Wired from `@mas/shared`

- **Contracts**: `ARCADE_POOL_ABI`, addresses, USDC helpers
- **API handlers**: `/api/score`, `/api/leaderboard`, `/api/user/upsert` — one-line re-exports
- **Components**: `Providers`, `ConnectHeader`, `TournamentEntry`, `GameOverSubmit`
- **Hooks**: `useTournamentEntry`, `useScoreSubmit`
- **Game helpers**: `seededRandom`, `shuffle`
- **Supabase**: `createClient`, `createServerSupabase`, `createAdminSupabase`, `Database`

## What you write

1. **`lib/game/engine.ts`** — deterministic game logic (`seededRandom(seed)` for fairness).
2. **`lib/game/types.ts`** — game state shape.
3. **`lib/game/engine.test.ts`** — `node:test` suites, run via `npm test`.
4. **`components/game/Game.tsx`** — orchestrator that calls `useScoreSubmit` on game-over.
5. **`app/globals.css`** — your aesthetic (swap CSS vars; shared components re-skin).
6. **`components/game/*.tsx`** — board / HUD / keyboard the game needs.

## Verify

```bash
npm run typecheck   # tsc --noEmit
npm test            # engine tests
npm run build       # next build; / route target < 50 kB
npm run dev         # local dev at :3011
```
