import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Game } from "@/components/game/Game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Challenge = {
  id: string;
  game_slug: string;
  seed_data: { word: string };
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
    .select("id, game_slug, seed_data, status")
    .eq("id", id)
    .maybeSingle();
  return (data as Challenge | null) ?? null;
}

export default async function ChallengePlayPage({
  params,
}: {
  params: { id: string };
}) {
  if (process.env.NEXT_PUBLIC_CHALLENGES !== "1") {
    return (
      <main style={{ padding: 20, color: "#FFC72C", fontFamily: "monospace" }}>
        Challenges are disabled.
      </main>
    );
  }
  const c = await fetchChallenge(params.id);
  if (!c) notFound();
  if (c.game_slug !== "wordle") notFound();

  return (
    <main style={{ padding: 20 }}>
      <div style={{ marginBottom: 20, color: "#FFC72C", fontFamily: "monospace", fontSize: 12 }}>
        CHALLENGE MODE · id {c.id.slice(0, 8)}… · status: {c.status}
      </div>
      <Game dailyWord={c.seed_data.word} />
    </main>
  );
}
