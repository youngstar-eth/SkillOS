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

/** Map raw contract revert reasons to friendly copy. */
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
  won,
  canSubmit,
  onRestart,
  onSubmit,
  submit,
}: {
  score: number;
  won: boolean;
  canSubmit: boolean;
  onRestart: () => void;
  onSubmit: () => void;
  submit: SubmitState;
}) {
  const buttonLabel = (() => {
    switch (submit.status) {
      case "signing": return "Preparing…";
      case "signed": return "Confirm in wallet";
      case "writing": return "Confirm in wallet";
      case "confirming": return "Waiting for block…";
      case "done": return "Submitted ✓";
      case "error": return "Retry submit";
      default:
        return canSubmit ? "Submit on-chain" : "Connect wallet to submit";
    }
  })();

  const buttonDisabled =
    !canSubmit ||
    submit.status === "signing" ||
    submit.status === "writing" ||
    submit.status === "confirming" ||
    submit.status === "done";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4b backdrop-blur-sm"
    >
      <div className="w-full max-w-sm border border-fg/30 bg-bg p-4b">
        <h2 className="font-display text-h2 text-accent-primary">
          {won ? "YOU WIN" : "GAME OVER"}
        </h2>
        <p className="mt-2b text-sm text-muted">
          Final score:{" "}
          <span className="font-display text-h3 text-fg">{score}</span>
        </p>

        <div className="mt-4b flex flex-col gap-2b">
          <button
            type="button"
            onClick={onRestart}
            className="min-h-[44px] w-full bg-fg px-3b py-2b font-display text-sm font-bold uppercase tracking-wider text-bg hover:bg-fg/90"
          >
            Play Again
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={buttonDisabled}
            className="min-h-[44px] w-full bg-accent-primary px-3b py-2b font-display text-sm font-bold uppercase tracking-wider text-fg disabled:opacity-40"
          >
            {buttonLabel}
          </button>
        </div>

        {submit.status === "signed" && (
          <Panel>
            <Row label="session">{submit.sessionId}</Row>
            <Row label="nonce" mono>{submit.nonce}</Row>
            <Row label="sig" mono>
              {submit.signature.slice(0, 10)}…{submit.signature.slice(-8)}
            </Row>
            <p className="mt-2b text-muted">
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
                className="underline"
              >
                {submit.txHash.slice(0, 10)}…
              </a>
            </p>
          </Panel>
        )}

        {submit.status === "done" && (
          <div className="mt-3b border border-accent-tertiary/50 bg-accent-tertiary/10 p-2b text-xs">
            <p className="font-display font-bold text-accent-tertiary">
              ✓ Score submitted on-chain
            </p>
            <p className="mt-1b break-all text-muted">
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
          <p className="mt-3b border border-danger/50 bg-danger/10 p-2b text-xs text-danger">
            {friendlyError(submit.message)}
          </p>
        )}
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3b border border-fg/30 p-2b text-[11px] text-muted">
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
    <div className={mono ? "mt-1b break-all" : ""}>
      <span className="text-fg">{label}</span> {children}
    </div>
  );
}
