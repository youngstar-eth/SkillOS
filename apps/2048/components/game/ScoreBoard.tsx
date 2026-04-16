export function ScoreBoard({
  score,
  best,
  moves,
}: {
  score: number;
  best: number;
  moves: number;
}) {
  return (
    <div
      aria-live="polite"
      className="flex w-full items-stretch gap-1b"
    >
      <Stat label="SCORE" value={score} emphasized />
      <Stat label="BEST" value={best} />
      <Stat label="MOVES" value={moves} />
    </div>
  );
}

function Stat({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: number;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center p-2b ${
        emphasized ? "bg-accent-primary text-fg" : "bg-fg/10 text-fg"
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
        {label}
      </span>
      <span className="font-display text-h3 font-black leading-none">
        {value}
      </span>
    </div>
  );
}
