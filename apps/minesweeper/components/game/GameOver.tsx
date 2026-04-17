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
  won,
  score,
  revealed,
  flagged,
  elapsedSec,
  canSubmit,
  onRestart,
  onSubmit,
  submit,
}: {
  won: boolean;
  score: number;
  revealed: number;
  flagged: number;
  elapsedSec: number;
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
    (!won && submit.status === "idle");

  const title = won ? "You win!" : "Game Over";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="win-raised w-full max-w-sm">
        <div className="win-titlebar">
          <span>{title}</span>
          <span className="opacity-75">◻ × ▢</span>
        </div>

        <div className="flex flex-col gap-2 p-3 bg-window">
          <p className="text-sm">
            Final score:{" "}
            <span className="font-bold">{won ? score.toLocaleString() : "0"}</span>
          </p>

          <div className="win-inset grid grid-cols-3 gap-1 p-2 text-xs">
            <Stat label="Time" value={`${elapsedSec}s`} />
            <Stat label="Revealed" value={revealed} />
            <Stat label="Flags" value={flagged} />
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={onRestart}
              className="win-raised active:win-pressed min-h-[28px] px-3 py-1 text-sm"
            >
              Play Again
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={buttonDisabled}
              className="win-raised active:win-pressed min-h-[28px] px-3 py-1 text-sm disabled:opacity-50"
              style={{
                background:
                  submit.status === "done"
                    ? "rgb(var(--color-success))"
                    : undefined,
              }}
            >
              {buttonLabel}
            </button>
            {!won && submit.status === "idle" && (
              <p className="text-center text-[10px] text-muted">
                No score to submit on a loss.
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
              <p className="mt-1">
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
                className="underline"
              >
                {submit.txHash.slice(0, 10)}…
              </a>
            </Panel>
          )}

          {submit.status === "done" && (
            <Panel>
              <p className="font-bold text-[rgb(var(--color-success))]">
                ✓ Score submitted on-chain
              </p>
              <p className="mt-1 break-all">
                <a
                  href={`https://sepolia.basescan.org/tx/${submit.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {submit.txHash}
                </a>
              </p>
            </Panel>
          )}

          {submit.status === "error" && (
            <div className="win-inset p-2 text-xs text-[rgb(var(--color-danger))]">
              {friendlyError(submit.message)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase text-muted">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="win-inset p-2 text-[11px]">
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
      <span className="font-bold">{label}:</span> {children}
    </div>
  );
}
