// Faz-0 challenge-evidence page — /challenge.
//
// One story: a false score was claimed, challenged, and economically slashed —
// and anyone can re-run the same public engine to reproduce the verdict.
// Read-only. Static facts are a convenience summary; the chain (Blockscout) and
// the Δ6 engine (recomputed below) are the source of truth.

import {
  CONTRACT,
  ROLES,
  GOLDEN,
  HONEST_LOOP,
  FRAUD_LOOP,
  ALL_TXS,
  HONEST_LABEL,
  CHAIN_ID,
  txUrl,
  addressUrl,
} from "@/lib/faz0/evidence";
import { resolveClaim, commitSeed, toInputLog } from "@/lib/faz0/resolver";

export const metadata = {
  title: "Challenge & Verify — SkillOS",
  description:
    "A false score was claimed, caught, and economically slashed on Base Sepolia. Re-run the same public engine and verify it yourself.",
};

const REPRODUCE_SNIPPET = `import { verifyMatch } from "@skillos/engines";

const seed = "${GOLDEN.seed}";
const moves = ${JSON.stringify(GOLDEN.moves)};
const log = moves.map((move, seq) => ({ seq, move }));

verifyMatch("2048", seed, log);
// => { score: ${GOLDEN.score}, valid: true }
// claimed 9999 ≠ replayed ${GOLDEN.score}  ⇒  fraud`;

export default function ChallengePage() {
  const inputLog = toInputLog(GOLDEN.moves);
  const honest = resolveClaim({
    seed: GOLDEN.seed,
    inputLog,
    claimedScore: HONEST_LOOP.claimedScore,
  });
  const fraud = resolveClaim({
    seed: GOLDEN.seed,
    inputLog,
    claimedScore: FRAUD_LOOP.claimedScore,
  });
  const recomputedCommit = commitSeed(GOLDEN.seed);

  return (
    <main className="py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Hero */}
        <section className="rounded-2xl border border-border bg-bg-elev p-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            Phase 0 · Base Sepolia · standalone demo
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            A false score was caught — and economically slashed.
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            One claim told the truth (score {GOLDEN.score}) and was credited.
            One lied (score {FRAUD_LOOP.claimedScore.toLocaleString()}), was
            challenged, and a resolver re-ran the public 2048 engine — the wrong
            side lost its bond. You don&apos;t have to trust us:{" "}
            <span className="text-neutral-200">re-run the engine yourself</span>{" "}
            below.
          </p>
          <p className="mt-3 inline-block rounded-lg border border-border bg-bg-elev2 px-3 py-1.5 text-xs text-neutral-300">
            Honest label: <span className="text-skill">{HONEST_LABEL}</span> —
            not &ldquo;cryptographically trustless.&rdquo;
          </p>
        </section>

        {/* The two loops */}
        <section className="grid gap-4 sm:grid-cols-2">
          <LoopCard
            tone="honest"
            title="Honest → finalized → credited"
            claimed={HONEST_LOOP.claimedScore}
            credited={HONEST_LOOP.creditedScore}
            finalState={HONEST_LOOP.finalState}
            verdict={honest}
            links={[
              { label: "finalize tx", href: txUrl(HONEST_LOOP.finalizeTx) },
            ]}
          />
          <LoopCard
            tone="fraud"
            title="Fraud → challenged → resolved → slashed"
            claimed={FRAUD_LOOP.claimedScore}
            credited={FRAUD_LOOP.creditedScore}
            finalState={FRAUD_LOOP.finalState}
            verdict={fraud}
            links={[
              { label: "challenge tx", href: txUrl(FRAUD_LOOP.challengeTx) },
              { label: "resolve / slash tx", href: txUrl(FRAUD_LOOP.resolveTx) },
            ]}
          />
        </section>

        {/* Reproduce-it — the strongest element */}
        <section className="rounded-2xl border border-skill/40 bg-bg-elev p-6">
          <h2 className="text-sm font-semibold tracking-tight text-skill">
            Reproduce the verdict yourself
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            These facts are independently verifiable — here&apos;s how. Run the
            same public, deterministic Δ6 engine on the on-chain-revealed seed.
            This page just did exactly that at render time:{" "}
            <span className="text-neutral-200">
              replayed score {honest.replayedScore}
            </span>
            , so claim 20 is honest and claim 9,999 is fraud.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-bg-elev2 p-4 text-xs leading-relaxed text-neutral-200">
            <code>{REPRODUCE_SNIPPET}</code>
          </pre>
          <p className="mt-3 text-xs text-neutral-500">Or with the resolver CLI:</p>
          <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-bg-elev2 p-4 text-xs leading-relaxed text-neutral-200">
            <code>{`# honest → score 20, fraud:false
npx tsx scripts/faz0/run-resolver.ts
# fraud → replayed 20 ≠ claimed 9999 ⇒ fraud:true
CLAIMED_SCORE=9999 npx tsx scripts/faz0/run-resolver.ts`}</code>
          </pre>
          <p className="mt-3 text-[11px] text-neutral-500">
            Seed <code className="text-neutral-300">&quot;{GOLDEN.seed}&quot;</code>{" "}
            commits to{" "}
            <code className="break-all text-neutral-300">{recomputedCommit}</code>{" "}
            (keccak256) — re-derived in your browser and matching the on-chain
            seedCommit.
          </p>
        </section>

        {/* On-chain evidence */}
        <section className="rounded-2xl border border-border bg-bg-elev p-6">
          <h2 className="text-sm font-semibold tracking-tight">
            On-chain evidence
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Static facts are a convenience; the chain and the engine are the
            source of truth. All links resolve to Base Sepolia (chain {CHAIN_ID})
            on Blockscout.
          </p>

          <dl className="mt-4 space-y-2 text-xs">
            <EvidenceRow label="SettlementDemo">
              <ExtLink href={addressUrl(CONTRACT.address)} mono>
                {CONTRACT.address}
              </ExtLink>
            </EvidenceRow>
            <EvidenceRow label="owner / claimer (A)">
              <ExtLink href={addressUrl(ROLES.owner)} mono>
                {ROLES.owner}
              </ExtLink>
            </EvidenceRow>
            <EvidenceRow label="resolver (B)">
              <ExtLink href={addressUrl(ROLES.resolver)} mono>
                {ROLES.resolver}
              </ExtLink>
            </EvidenceRow>
            <EvidenceRow label="challenger (C)">
              <ExtLink href={addressUrl(ROLES.challenger)} mono>
                {ROLES.challenger}
              </ExtLink>
            </EvidenceRow>
          </dl>

          <div className="mt-5 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-bg-elev2 text-[10px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Step</th>
                  <th className="px-3 py-2">Signer</th>
                  <th className="px-3 py-2 text-right">Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {ALL_TXS.map((t, i) => (
                  <tr key={t.hash} className="text-neutral-300">
                    <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2">{t.step}</td>
                    <td className="px-3 py-2">{t.signer}</td>
                    <td className="px-3 py-2 text-right">
                      <ExtLink href={txUrl(t.hash)} mono>
                        {t.hash.slice(0, 10)}…
                      </ExtLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Honest scope disclaimer */}
        <section className="rounded-2xl border border-dashed border-border p-5">
          <p className="text-[11px] leading-relaxed text-neutral-500">
            <span className="text-neutral-400">Scope:</span> SettlementDemo is a
            standalone Phase 0 pitch demo. It is <em>not</em> the production
            settlement path, <em>not</em> the v2.3 settle, and <em>not</em> an
            audit fix. A score is <em>claimed</em> (not re-executed on-chain);
            the security property is <em>challenge + deterministic replay</em>,
            not on-chain re-execution.
          </p>
        </section>
      </div>
    </main>
  );
}

function LoopCard({
  tone,
  title,
  claimed,
  credited,
  finalState,
  verdict,
  links,
}: {
  tone: "honest" | "fraud";
  title: string;
  claimed: number;
  credited: number;
  finalState: string;
  verdict: { replayedScore: number; fraud: boolean };
  links: { label: string; href: string }[];
}) {
  const accent = tone === "fraud" ? "text-red-400" : "text-skill";
  return (
    <div className="rounded-2xl border border-border bg-bg-elev p-5">
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${accent}`}>
        {tone}
      </p>
      <h3 className="mt-1 text-sm font-semibold tracking-tight text-neutral-200">
        {title}
      </h3>
      <dl className="mt-3 space-y-1.5 text-xs text-neutral-400">
        <Stat k="Claimed score" v={claimed.toLocaleString()} />
        <Stat k="Δ6 replayed score" v={verdict.replayedScore.toLocaleString()} />
        <Stat k="Verdict" v={verdict.fraud ? "FRAUD" : "honest"} accent={accent} />
        <Stat k="Final state" v={finalState} />
        <Stat k="Credited" v={credited.toLocaleString()} />
      </dl>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {links.map((l) => (
          <ExtLink key={l.href} href={l.href}>
            {l.label} ↗
          </ExtLink>
        ))}
      </div>
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{k}</dt>
      <dd className={`tabular-nums ${accent ?? "text-neutral-200"}`}>{v}</dd>
    </div>
  );
}

function EvidenceRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ExtLink({
  href,
  children,
  mono,
}: {
  href: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-skill underline-offset-4 hover:underline ${
        mono ? "break-all font-mono" : ""
      }`}
    >
      {children}
    </a>
  );
}
