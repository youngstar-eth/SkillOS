import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-xl space-y-8 text-center">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
            Base Batches 003 · Student Track
          </p>
          <h1 className="text-4xl font-semibold sm:text-5xl">
            Skillbase Duel
          </h1>
          <p className="text-neutral-400">
            Async matchmaking 2048 duels. Stake USDC on Base, play the same
            seeded board, higher score wins.
          </p>
        </header>

        <Link
          href="/duel/waiting"
          className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-neutral-200"
        >
          Start Duel
        </Link>

        <p className="pt-8 text-xs text-neutral-500">
          Built by Simpl3 Inc. · v2-clean scaffold
        </p>
      </div>
    </main>
  );
}
