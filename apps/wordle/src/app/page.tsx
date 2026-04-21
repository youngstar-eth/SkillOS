"use client";

import { useRouter } from "next/navigation";
import { useAccount, useConnect } from "wagmi";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const [picker, setPicker] = useState(false);

  function handleStart() {
    if (isConnected) {
      router.push("/duel/waiting");
      return;
    }
    setPicker(true);
  }

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="space-y-6 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-elev px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-skill" />
            Skillbase · Wordle
          </p>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Wordle duels{" "}
            <span className="text-skill">on Base</span>
          </h1>

          <p className="mx-auto max-w-lg text-base text-neutral-400 sm:text-lg">
            Stake 1 USDC, match a player, guess the same 5-letter target in 6
            tries. Best score wins the pool.
          </p>

          <div className="flex flex-col items-center gap-3 pt-2">
            <button
              onClick={handleStart}
              disabled={isPending}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-skill px-8 text-base font-semibold text-black transition hover:bg-yellow-400 disabled:opacity-60"
            >
              {isConnected ? "Start Duel" : "Connect Wallet to Start"}
            </button>
            {!isConnected && (
              <p className="text-xs text-neutral-500">
                Coinbase Smart Wallet or MetaMask · Base Sepolia
              </p>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="mt-16 grid gap-3 sm:grid-cols-3">
          {[
            {
              n: "01",
              t: "Stake",
              d: "Approve & stake 1 USDC. Your seat is reserved.",
            },
            {
              n: "02",
              t: "Match",
              d: "Paired with the next player who stakes.",
            },
            {
              n: "03",
              t: "Duel",
              d: "Same target word, 2 minutes. Higher score wins the pool.",
            },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-xl border border-border-subtle bg-bg-elev p-5"
            >
              <p className="text-xs font-mono text-skill">{s.n}</p>
              <p className="mt-2 text-sm font-semibold">{s.t}</p>
              <p className="mt-1 text-sm text-neutral-400">{s.d}</p>
            </div>
          ))}
        </div>

        {/* Scoring explainer */}
        <div className="mt-8 rounded-xl border border-border-subtle bg-bg-elev p-5 text-sm text-neutral-400">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Scoring
          </p>
          <p>
            Solve in{" "}
            <span className="font-mono text-neutral-200">N</span> guesses:{" "}
            <span className="font-mono text-skill">(7 − N) × 1000</span> points
            ({" "}
            <span className="font-mono">6000</span> at 1 guess,{" "}
            <span className="font-mono">1000</span> at 6). Speed bonus:{" "}
            <span className="font-mono">+1 per 100ms saved</span>, capped at{" "}
            <span className="font-mono">6000</span>. Didn&apos;t solve? 1
            point — you still played.
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

      {/* Connector picker modal */}
      {picker && !isConnected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setPicker(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-bg-elev shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border-subtle px-4 py-3 text-sm font-semibold">
              Connect wallet
            </div>
            <div className="p-2">
              {connectors.map((c) => (
                <button
                  key={c.uid}
                  onClick={() => {
                    connect({ connector: c });
                    setPicker(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm hover:bg-bg-elev2"
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-neutral-500">→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
