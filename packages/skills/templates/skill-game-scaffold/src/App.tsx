// Minimal SkillOS integration demo:
//   1. Sign in with Base (SIWB via wagmi).
//   2. Pick a tournament from the live list.
//   3. Submit a score; surface the txHash.
//
// To start from this scaffold, replace this UI with your actual game and
// call `submit({ score, tier: 'T0' })` at game-over.

import { useState } from 'react';
import {
  useSkillOSAuth,
  useSkillOSTournaments,
  useSkillOSScore,
} from '@skillos/sdk/react';
import { submitScoreOnce } from './score-submit';

export function App() {
  return (
    <main>
      <h1>SkillOS game scaffold</h1>
      <p>
        Minimum-viable wiring: Provider + useSkillOSAuth + useSkillOSScore.
        Replace this UI with your skill game.
      </p>
      <SignInPanel />
      <hr />
      <TournamentPicker />
    </main>
  );
}

function SignInPanel() {
  const { signIn, signOut, isSignedIn, address, expiresAt } = useSkillOSAuth();
  if (!isSignedIn) {
    return (
      <p>
        <button onClick={() => signIn().catch(console.error)}>
          Sign in with Base
        </button>
      </p>
    );
  }
  return (
    <p>
      Signed in as <code>{address}</code>
      {expiresAt ? ` (expires ${new Date(expiresAt).toLocaleTimeString()})` : ''}{' '}
      <button onClick={signOut}>Sign out</button>
    </p>
  );
}

function TournamentPicker() {
  const { data, isLoading, error } = useSkillOSTournaments({ filter: { limit: 5 } });
  const [selectedId, setSelectedId] = useState<`0x${string}` | null>(null);

  if (isLoading) return <p>Loading tournaments…</p>;
  if (error) return <p>Failed to load tournaments: {error.message}</p>;
  if (!data?.items.length) return <p>No tournaments live right now.</p>;

  return (
    <section>
      <h2>Tournaments</h2>
      <ul>
        {data.items.map((t) => (
          <li key={t.id}>
            <label>
              <input
                type="radio"
                name="tournament"
                checked={selectedId === t.id}
                onChange={() => setSelectedId(t.id as `0x${string}`)}
              />{' '}
              <strong>{t.game}</strong> — pool {t.prizePool}, ends{' '}
              {new Date(t.endsAt * 1000).toLocaleString()}
            </label>
          </li>
        ))}
      </ul>
      {selectedId && <SubmitForm tournamentId={selectedId} />}
    </section>
  );
}

function SubmitForm({ tournamentId }: { tournamentId: `0x${string}` }) {
  const [score, setScore] = useState(1024);
  const { submit, status, data, error } = useSkillOSScore({ tournamentId });

  return (
    <section>
      <h3>Submit a score</h3>
      <p>
        <label>
          Score:{' '}
          <input
            type="number"
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            min={0}
          />
        </label>{' '}
        <button
          onClick={() => submitScoreOnce(submit, { score, tier: 'T0' })}
          disabled={status === 'pending'}
        >
          {status === 'pending' ? 'Submitting…' : `Submit ${score}`}
        </button>
      </p>
      {data?.txHash && (
        <p>
          Submitted:{' '}
          <a
            href={`https://sepolia.basescan.org/tx/${data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {data.txHash.slice(0, 14)}…
          </a>
        </p>
      )}
      {error && <p style={{ color: 'crimson' }}>Error: {error.message}</p>}
    </section>
  );
}
