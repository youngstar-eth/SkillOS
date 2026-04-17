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
  won,
  finalScore,
  score,
  maxCombo,
  level,
  canSubmit,
  onRestart,
  onSubmit,
  submit,
}: {
  won: boolean;
  finalScore: number;
  score: number;
  maxCombo: number;
  level: number;
  canSubmit: boolean;
  onRestart: () => void;
  onSubmit: () => void;
  submit: SubmitState;
}) {
  const title = won ? "All clear" : "Game Over";
  const titleClass = won ? "neon-yellow" : "neon-pink";

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
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded border-2 border-synth-purple/60 bg-bg p-5 shadow-[0_0_48px_rgba(170,84,255,0.3)]">
        <h2 className={`text-h2 ${titleClass}`}>{title}</h2>

        <p className="mt-2 text-sm text-muted">
          Final score:{" "}
          <span className="neon-cyan text-h3 tabular-nums">
            {finalScore.toLocaleString()}
          </span>
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3 rounded border border-border bg-surface/60 p-3 text-xs">
          <Stat label="Score" value={score.toLocaleString()} />
          <Stat label="Max combo" value={maxCombo} />
          <Stat label="Level" value={`${level}/5`} />
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="min-h-[44px] w-full rounded border border-border bg-surface text-sm font-bold uppercase tracking-[0.2em] text-fg hover:border-synth-cyan hover:text-synth-cyan"
          >
            Play again
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={buttonDisabled}
            className="min-h-[44px] w-full rounded bg-synth-cyan text-sm font-bold uppercase tracking-[0.2em] text-bg shadow-[0_0_18px_rgba(82,174,255,0.5)] hover:bg-synth-cyan/90 disabled:opacity-40 disabled:shadow-none"
          >
            {buttonLabel}
          </button>
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
              className="text-synth-cyan underline"
            >
              {submit.txHash.slice(0, 10)}…
            </a>
          </Panel>
        )}

        {submit.status === "done" && (
          <div className="mt-4 rounded border border-success/40 bg-success/10 p-3 text-xs">
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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-[0.15em] text-muted">
        {label}
      </span>
      <span className="font-bold text-fg tabular-nums">{value}</span>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded border border-border bg-surface/60 p-3 text-[11px] text-muted">
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
    <div className={mono ? "mt-1 break-all font-mono" : ""}>
      <span className="font-bold text-fg">{label}:</span> {children}
    </div>
  );
}
