type PageProps = {
  params: { id: string };
};

export default function DuelPage({ params }: PageProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-md space-y-4 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
          Duel
        </p>
        <h1 className="text-2xl font-semibold">Match #{params.id}</h1>
        <p className="text-sm text-neutral-400">
          2048 board goes here. Same seed for both players.
        </p>
        <p className="pt-8 text-xs text-neutral-500">
          Placeholder — game engine lands in F2.
        </p>
      </div>
    </main>
  );
}
