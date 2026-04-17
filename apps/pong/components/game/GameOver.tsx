"use client";

import type { Hex } from "viem";

export type SubmitState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "signed"; sessionId: string; nonce: string; signature: Hex }
  | { status: "writing"; sessionId: string; nonce: string; signature: Hex }
  | {
      status: "confirming";
      sessionId: string;
      nonce: string;
      signature: Hex;
      txHash: Hex;
    }
  | { status: "done"; txHash: Hex; sessionId: string }
  | { status: "error"; message: string };

function friendlyError(raw: string): string {
  const m = raw.match(/reverted with reason string ['"](.+?)['"]/);
  const reason = m?.[1] ?? raw.split("\n")[0];
  const map: Record<string, string> = {
    "Not entered": "You haven't entered this tournament yet.",
    "Tournament ended": "Tournament is over. Scores can no longer be submitted.",
    "Nonce used": "This session was already submitted.",
    "Invalid signature": "Signature verification failed — server/client mismatch.",
  };
  return map[reason] ?? reason;
}

export function GameOver({
  finalScore,
  playerScore,
  aiScore,
  totalRallies,
  maxRally,
  canSubmit,
  onRestart,
  onSubmit,
  submit,
}: {
  finalScore: number;
  playerScore: number;
  aiScore: number;
  totalRallies: number;
  maxRally: number;
  canSubmit: boolean;
  onRestart: () => void;
  onSubmit: () => void;
  submit: SubmitState;
}) {
  const won = playerScore > aiScore;
  const title = won ? "You win" : playerScore === aiScore ? "Draw" : "AI wins";

  const buttonLabel = (() => {
    switch (submit.status) {
      case "signing":
        return "Preparing…";
      case "signed":
      case "writing":
        return "Confirm in wallet";
      case "confirming":
        return "Waiting for block…";
      case "done":
        return "Submitted ✓";
      case "error":
        return "Retry submit";
      default:
        return canSubmit ? "Submit on-chain" : "Connect wallet to submit";
    }
  })();

  const buttonDisabled =
    !canSubmit ||
    submit.status === "signing" ||
    submit.status === "writing" ||
    submit.status === "confirming" ||
    submit.status === "done" ||
    (finalScore === 0 && submit.status === "idle");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Match finished"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-lg border border-accent-alt/60 bg-surface p-5 shadow-[0_0_48px_rgba(255,0,149,0.25)]">
        <h2 className="text-h2 neon-pink">{title}</h2>

        <p className="mt-2 text-sm text-muted">
          Final score:{" "}
          <span className="score-digit align-middle" style={{ fontSize: 32 }}>
            {finalScore}
          </span>
        </p>

        <div className="mt-4 grid grid-cols-4 gap-3 rounded border border-border bg-bg/60 p-3 text-xs">
          <StatRow label="You" value={playerScore} />
          <StatRow label="AI" value={aiScore} />
          <StatRow label="Rallies" value={totalRallies} />
          <StatRow label="Longest" value={maxRally} />
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="min-h-[44px] w-full rounded border border-border bg-surface-2 text-sm font-bold uppercase tracking-[0.2em] text-fg hover:border-accent"
          >
            Play again
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={buttonDisabled}
            className="min-h-[44px] w-full rounded bg-accent text-sm font-bold uppercase tracking-[0.2em] text-[#0d1117] shadow-[0_0_18px_rgba(84,174,255,0.45)] hover:bg-accent/90 disabled:opacity-40 disabled:shadow-none"
          >
            {buttonLabel}
          </button>
          {finalScore === 0 && submit.status === "idle" && (
            <p className="text-center text-[10px] text-muted">
              Score of 0 — nothing to submit on-chain.
            </p>
          )}
        </div>

        {submit.status === "signed" && (
          <Panel>
            <Row label="session">{submit.sessionId}</Row>
            <Row label="nonce" mono>
              {submit.nonce}
            </Row>
            <Row label="sig" mono>
              {submit.signature.slice(0, 10)}…{submit.signature.slice(-8)}
            </Row>
            <p className="mt-1 text-muted">
              Click <b>Confirm in wallet</b> to call submitScore on-chain.
            </p>
          </Panel>
        )}

        {submit.status === "confirming" && (
          <Panel>
            Pending tx —{" "}
            <a
              href={`https://sepolia.basescan.org/tx/${submit.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              {submit.txHash.slice(0, 10)}…
            </a>
          </Panel>
        )}

        {submit.status === "done" && (
          <div className="mt-4 rounded border border-success/50 bg-success/10 p-3 text-xs">
            <p className="font-bold text-success">✓ Score submitted on-chain</p>
            <p className="mt-1 break-all text-muted">
              <a
                href={`https://sepolia.basescan.org/tx/${submit.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {submit.txHash}
              </a>
            </p>
          </div>
        )}

        {submit.status === "error" && (
          <p className="mt-4 rounded border border-danger/50 bg-danger/10 p-3 text-xs text-danger">
            {friendlyError(submit.message)}
          </p>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-[0.15em] text-muted">
        {label}
      </span>
      <span className="font-mono text-base font-bold text-fg tabular-nums">
        {value}
      </span>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded border border-border bg-bg/60 p-3 text-[11px] text-muted">{children}</div>;
}

function Row({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={mono ? "mt-1 break-all font-mono" : ""}>
      <span className="font-bold text-fg">{label}:</span> {children}
    </div>
  );
}
