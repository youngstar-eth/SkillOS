import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { AcceptChallengeModal } from "@mas/shared/components";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Challenge = {
  id: string;
  game_slug: string;
  creator_address: string;
  creator_score: number | null;
  stake_usdc: number;
  expires_at: string;
  status: string;
};

async function fetchChallenge(id: string): Promise<Challenge | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb
    .from("challenges")
    .select(
      "id, game_slug, creator_address, creator_score, stake_usdc, expires_at, status",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as Challenge | null) ?? null;
}

export default async function ChallengeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (process.env.NEXT_PUBLIC_CHALLENGES !== "1") {
    return (
      <main style={{ padding: 40, color: "#FFC72C", fontFamily: "monospace" }}>
        Challenges are disabled.
      </main>
    );
  }
  const c = await fetchChallenge(params.id);
  if (!c) notFound();

  const pilotHost: Record<string, string> = {
    wordle: "https://wordle.skillbase.games",
    "2048": "https://2048.skillbase.games",
    hillclimb: "https://hillclimb.skillbase.games",
  };
  const playHref = `${pilotHost[c.game_slug] ?? ""}/challenge/${c.id}`;

  return (
    <main style={{ padding: 40 }}>
      <AcceptChallengeModal
        challengeId={c.id}
        gameSlug={c.game_slug}
        creatorAddress={c.creator_address}
        creatorScore={c.creator_score}
        stakeUsdc={c.stake_usdc}
        expiresAt={c.expires_at}
        playHref={playHref}
      />
    </main>
  );
}
