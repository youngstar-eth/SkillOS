export default function WaitingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Looking for opponent…</h1>
        <p className="text-sm text-neutral-400">
          You&apos;re in the queue. We&apos;ll match you with the next player
          who stakes.
        </p>
        <p className="pt-8 text-xs text-neutral-500">
          Placeholder — matchmaking wiring lands in F1.
        </p>
      </div>
    </main>
  );
}
