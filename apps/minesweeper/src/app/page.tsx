export default function HomePage() {
  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="space-y-6 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-skill/40 bg-skill/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-skill">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-skill" />
            Coming soon
          </p>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Minesweeper duels <span className="text-skill">on Base</span>
          </h1>

          <p className="mx-auto max-w-lg text-base text-neutral-400 sm:text-lg">
            Stake 1 USDC, match a player, clear the same board without
            hitting a mine. Higher score in 2 minutes wins the pool.
          </p>

          <p className="pt-2 text-sm text-neutral-500">
            Live first on{" "}
            <a
              href="https://2048.skillbase.games"
              className="underline hover:text-neutral-300"
            >
              2048.skillbase.games
            </a>
            .
          </p>
        </div>

        <footer className="mt-24 flex flex-col items-center gap-2 text-xs text-neutral-500">
          <p>Built by Simpl3 Inc.</p>
          <a
            href="https://github.com/youngstar-eth/skillbase"
            target="_blank"
            rel="noreferrer"
            className="hover:text-neutral-300"
          >
            github.com/youngstar-eth/skillbase
          </a>
        </footer>
      </div>
    </main>
  );
}
