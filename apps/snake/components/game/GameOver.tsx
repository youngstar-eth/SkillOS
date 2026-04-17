"use client";

import type { Hex } from "viem";

export type SubmitState =
  | { status: "idle" }
  | { status: "signing" }
  | {
      status: "signed";
      sessionId: string;
      nonce: string;
      signature: Hex;
    }
  | {
      status: "writing";
      sessionId: string;
      nonce: string;
      signature: Hex;
    }
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
  score,
  ateCount,
  snakeLength,
  ticks,
  canSubmit,
  onRestart,
  onSubmit,
  submit,
}: {
  score: number;
  ateCount: number;
  snakeLength: number;
  ticks: number;
  canSubmit: boolean;
  onRestart: () => void;
  onSubmit: () => void;
  submit: SubmitState;
}) {
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
    (score === 0 && submit.status === "idle");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm border-2 border-accent-2/60 bg-black/85 p-5 shadow-[0_0_32px_rgba(255,100,180,0.35)]">
        <h2 className="text-h2 neon-pink">Game Over</h2>

        <p className="mt-2 text-sm text-muted">
          Final score:{" "}
          <span className="neon-teal text-h3">{score}</span>
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3 border border-accent/30 bg-black/30 p-3 text-xs">
          <StatRow label="Eaten" value={ateCount} />
          <StatRow label="Length" value={snakeLength} />
          <StatRow label="Ticks" value={ticks} />
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="min-h-[44px] w-full border border-accent/60 bg-black/40 text-sm uppercase tracking-[0.2em] text-accent hover:border-accent"
          >
            Play Again
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={buttonDisabled}
            className="min-h-[44px] w-full border border-accent-2 bg-accent-2/20 text-sm uppercase tracking-[0.2em] text-accent-2 hover:bg-accent-2/30 disabled:opacity-40"
          >
            {buttonLabel}
          </button>
          {score === 0 && submit.status === "idle" && (
            <p className="text-[11px] text-muted">
              No food eaten — nothing to submit.
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
            <p className="mt-2 text-muted">
              Click <b>Confirm in wallet</b> to call submitScore on-chain.
            </p>
          </Panel>
        )}

        {submit.status === "confirming" && (
          <Panel>
            <p className="text-muted">
              Pending tx —{" "}
              <a
                href={`https://sepolia.basescan.org/tx/${submit.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="neon-teal underline"
              >
                {submit.txHash.slice(0, 10)}…
              </a>
            </p>
          </Panel>
        )}

        {submit.status === "done" && (
          <div className="mt-4 border border-success/50 bg-success/10 p-3 text-xs">
            <p className="text-success">✓ Score submitted on-chain</p>
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
          <p className="mt-4 border border-danger/50 bg-danger/10 p-3 text-xs text-danger">
            {friendlyError(submit.message)}
          </p>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.15em] text-muted">
        {label}
      </div>
      <div className="neon-teal text-lg leading-none">{value}</div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 border border-accent/30 bg-black/30 p-3 text-[11px] text-muted">
      {children}
    </div>
  );
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
    <div className={mono ? "mt-1 break-all" : ""}>
      <span className="neon-teal">{label}</span> {children}
    </div>
  );
}
