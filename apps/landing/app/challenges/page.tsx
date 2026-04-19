import { createClient } from "@supabase/supabase-js";
import { ChallengeCard } from "@mas/shared/components";
import type { Challenge } from "@mas/shared/challenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchOpen(): Promise<Challenge[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb
    .from("challenges")
    .select("*")
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data as Challenge[] | null) ?? []) as Challenge[];
}

export default async function ChallengesPage() {
  if (process.env.NEXT_PUBLIC_CHALLENGES !== "1") {
    return (
      <main style={{ padding: 40, color: "#FFC72C", fontFamily: "monospace" }}>
        Challenges are disabled.
      </main>
    );
  }
  const rows = await fetchOpen();
  return (
    <main style={{ padding: 40, color: "#FFC72C", fontFamily: "monospace" }}>
      <h1 style={{ fontSize: 18, letterSpacing: "0.3em", marginBottom: 20 }}>
        ACTIVE CHALLENGES
      </h1>
      {rows.length === 0 ? (
        <p style={{ opacity: 0.6 }}>No open challenges right now.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 10,
          }}
        >
          {rows.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              href={`/challenge/${c.id}`}
            />
          ))}
        </div>
      )}
    </main>
  );
}
