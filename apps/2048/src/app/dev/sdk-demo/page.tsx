"use client";

// Sprint X3 dogfood — exercises @skillos/sdk hooks in apps/2048.
//
// Per Sprint X3 Q1c lock: this page consumes Auth, Tournaments, Leaderboard,
// and Sponsor hooks. Score submission stays on the internal
// /api/tournaments/[id]/solo route (AI plausibility + paid-retry + SP
// awarding coupling) — useSkillOSScore is wired but disabled from UI.
//
// Visit /dev/sdk-demo on localhost:3000 to smoke-test.

import { useState } from "react";
import {
  useSkillOSAuth,
  useSkillOSLeaderboard,
  useSkillOSSponsor,
  useSkillOSTournaments,
} from "@skillos/sdk/react";
import { builderCodeToDataSuffix } from "@skillos/sdk";
import { useAccount, useWriteContract } from "wagmi";

const BUILDER_CODE = "bc_o6szuvg1";

export default function SdkDemoPage() {
  const auth = useSkillOSAuth();
  const tournaments = useSkillOSTournaments({ filter: { limit: 5 } });
  const wallet = useAccount();

  const firstTournamentId = tournaments.data?.items[0]?.id as
    | `0x${string}`
    | undefined;

  return (
    <main className="space-y-8 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">@skillos/sdk dogfood</h1>
        <p className="text-sm text-neutral-400">
          Sprint X3 — exercises Auth + Tournaments + Leaderboard + Sponsor
          hooks. Score submission stays on the internal /api route.
        </p>
        <p className="text-xs text-neutral-500 font-mono">
          builderCode: {BUILDER_CODE} · dataSuffix:{" "}
          {builderCodeToDataSuffix(BUILDER_CODE)}
        </p>
      </header>

      <Section title="useSkillOSAuth (SIWB sign-in)">
        <p className="text-sm">
          wagmi connected: <code>{String(wallet.isConnected)}</code>
          {wallet.address && (
            <>
              {" "}
              · {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
            </>
          )}
        </p>
        <p className="text-sm">
          SkillOS signed in: <code>{String(auth.isSignedIn)}</code>
          {auth.expiresAt && (
            <>
              {" "}
              · expires {new Date(auth.expiresAt).toLocaleString()}
            </>
          )}
        </p>
        <div className="flex gap-2">
          {!auth.isSignedIn ? (
            <button
              type="button"
              onClick={() => {
                void auth.signIn().catch((err) => {
                  console.error("[sdk-demo] signIn failed", err);
                  alert(`signIn failed: ${(err as Error).message}`);
                });
              }}
              className="px-3 py-1.5 rounded bg-lime-500 text-black text-sm font-medium hover:bg-lime-400"
            >
              Sign in with Base
            </button>
          ) : (
            <button
              type="button"
              onClick={auth.signOut}
              className="px-3 py-1.5 rounded border border-neutral-700 text-sm hover:bg-neutral-900"
            >
              Sign out
            </button>
          )}
        </div>
      </Section>

      <Section title="useSkillOSTournaments (GET /v1/tournaments)">
        {tournaments.isLoading && <p className="text-sm">Loading…</p>}
        {tournaments.error && (
          <p className="text-sm text-red-400">
            {(tournaments.error as Error).message}
          </p>
        )}
        {tournaments.data && (
          <ul className="space-y-1 text-sm font-mono">
            {tournaments.data.items.map((t) => (
              <li key={t.id}>
                {t.game} · {t.id.slice(0, 10)}… · pool={t.prizePool} · settled=
                {String(t.settled)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="useSkillOSLeaderboard (first tournament)">
        {firstTournamentId ? (
          <LeaderboardPanel tournamentId={firstTournamentId} />
        ) : (
          <p className="text-sm text-neutral-500">
            No tournament available — list above is empty.
          </p>
        )}
      </Section>

      {firstTournamentId && (
        <Section title="useSkillOSSponsor — Builder Code attribution">
          <SponsorPanel tournamentId={firstTournamentId} />
        </Section>
      )}

      <Section title="useSkillOSScore (scaffolded; not consumed here)">
        <p className="text-sm text-neutral-400">
          Per X3 Q1c lock, apps/2048 keeps its internal{" "}
          <code>/api/tournaments/[id]/solo</code> route for score submission
          to preserve AI plausibility, paid-retry, and SP awarding logic. The{" "}
          <code>useSkillOSScore</code> hook ships in the SDK and is testable
          via <code>/tmp/sdk-test</code>.
        </p>
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-neutral-800 p-4 space-y-3">
      <h2 className="text-sm font-medium text-neutral-300">{title}</h2>
      {children}
    </section>
  );
}

function LeaderboardPanel({ tournamentId }: { tournamentId: `0x${string}` }) {
  const lb = useSkillOSLeaderboard({ tournamentId, limit: 5 });
  if (lb.isLoading) return <p className="text-sm">Loading…</p>;
  if (lb.error) {
    return (
      <p className="text-sm text-red-400">{(lb.error as Error).message}</p>
    );
  }
  if (!lb.data) return null;
  if (lb.data.items.length === 0) {
    return <p className="text-sm text-neutral-500">No scores yet.</p>;
  }
  return (
    <ol className="space-y-1 text-sm font-mono">
      {lb.data.items.map((row) => (
        <li key={`${row.transactionHash}-${row.rank}`}>
          #{row.rank} · {row.player.slice(0, 6)}…{row.player.slice(-4)} · score=
          {row.score}
        </li>
      ))}
    </ol>
  );
}

function SponsorPanel({ tournamentId }: { tournamentId: `0x${string}` }) {
  const sponsor = useSkillOSSponsor({ tournamentId });
  const [amount, setAmount] = useState("1");
  const [stage, setStage] = useState<
    "idle" | "approving" | "funding" | "done" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [approveHash, setApproveHash] = useState<`0x${string}` | null>(null);
  const [sponsorHash, setSponsorHash] = useState<`0x${string}` | null>(null);
  const { writeContractAsync } = useWriteContract();

  async function run() {
    setStage("approving");
    setErrorMessage(null);
    try {
      const calls = sponsor.fundCalldata({ amountUsdc: amount });
      const approveTx = await writeContractAsync(calls.approve);
      setApproveHash(approveTx);
      setStage("funding");
      const fundTx = await writeContractAsync(calls.fund);
      setSponsorHash(fundTx);
      setStage("done");
    } catch (err) {
      setStage("error");
      setErrorMessage((err as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="usdc-amount">USDC amount:</label>
        <input
          id="usdc-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-24 rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm font-mono"
          disabled={stage === "approving" || stage === "funding"}
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={stage === "approving" || stage === "funding"}
          className="px-3 py-1 rounded bg-lime-500 text-black text-sm font-medium hover:bg-lime-400 disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          Sponsor pool
        </button>
        <span className="text-xs text-neutral-500 font-mono">
          stage: {stage}
        </span>
      </div>
      {errorMessage && (
        <p className="text-xs text-red-400 font-mono">{errorMessage}</p>
      )}
      {approveHash && (
        <p className="text-xs font-mono">
          approve tx:{" "}
          <a
            href={`https://sepolia.basescan.org/tx/${approveHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-lime-400 underline"
          >
            {approveHash.slice(0, 14)}…
          </a>
        </p>
      )}
      {sponsorHash && (
        <p className="text-xs font-mono">
          sponsor tx (dataSuffix = {builderCodeToDataSuffix(BUILDER_CODE)}):{" "}
          <a
            href={`https://sepolia.basescan.org/tx/${sponsorHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-lime-400 underline"
          >
            {sponsorHash.slice(0, 14)}…
          </a>
        </p>
      )}
    </div>
  );
}
