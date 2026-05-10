#!/usr/bin/env -S tsx
// ─────────────────────────────────────────────────────────────────────────────
// One-shot SP backfill — recomputes v2_user_stats from historical source
// rows (v2_duels, v2_tournament_solo_runs, v2_tournament_entries) using the
// same pure @skillos/sp-engine formula the runtime hooks use.
//
// Idempotent: ALWAYS recomputes from scratch and UPSERTs full totals,
// overwriting any existing row. Safe to re-run. Because every runtime
// SP award has a corresponding source row, a re-run converges to the
// same answer regardless of intervening runtime activity.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/backfill-sp.ts
//
// Or via the root package.json convenience: `npm run backfill:sp`.
//
// Reports at the end:
//   - unique users backfilled
//   - total SP distributed
//   - sanity breakdown: per-event-kind SP contribution
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { getAddress } from "viem";
import {
  awardSP,
  levelForSP,
  type SPEvent,
  type Verdict,
} from "@skillos/sp-engine";

// ─── env check ───────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY before running.",
  );
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── aggregation buffer ──────────────────────────────────────────────────────

interface UserAgg {
  total_sp: number;
  duels_won: number;
  duels_lost: number;
  tournaments_participated: number;
  tournaments_won: number;
  last_active_at: string;
  // For the sanity breakdown only — not persisted
  from_duel_sp: number;
  from_solo_sp: number;
  from_rank_bonus_sp: number;
}

const agg = new Map<string, UserAgg>();

function emptyRow(): UserAgg {
  return {
    total_sp: 0,
    duels_won: 0,
    duels_lost: 0,
    tournaments_participated: 0,
    tournaments_won: 0,
    last_active_at: "1970-01-01T00:00:00Z",
    from_duel_sp: 0,
    from_solo_sp: 0,
    from_rank_bonus_sp: 0,
  };
}

function bump(
  addrRaw: string,
  sp: number,
  counters: {
    duels_won?: number;
    duels_lost?: number;
    tournaments_participated?: number;
    tournaments_won?: number;
  },
  activityIso: string | null | undefined,
  bucket: "duel" | "solo" | "rank_bonus",
) {
  let addr: string;
  try {
    addr = getAddress(addrRaw);
  } catch {
    console.warn("[backfill-sp] skipping unparseable address:", addrRaw);
    return;
  }
  const cur = agg.get(addr) ?? emptyRow();
  cur.total_sp += sp;
  cur.duels_won += counters.duels_won ?? 0;
  cur.duels_lost += counters.duels_lost ?? 0;
  cur.tournaments_participated += counters.tournaments_participated ?? 0;
  cur.tournaments_won += counters.tournaments_won ?? 0;
  if (activityIso && activityIso > cur.last_active_at) {
    cur.last_active_at = activityIso;
  }
  if (bucket === "duel") cur.from_duel_sp += sp;
  else if (bucket === "solo") cur.from_solo_sp += sp;
  else cur.from_rank_bonus_sp += sp;
  agg.set(addr, cur);
}

async function main() {
// ─── 1. settled duels ────────────────────────────────────────────────────────
// For each settled duel: winner gets duel_win, loser gets duel_loss — unless
// the loser didn't actually submit (walkover), in which case they skip both
// the SP bucket and the duels_lost counter. Matches the runtime convention
// in packages/duel-backend/src/settle.ts.

console.log("[backfill-sp] reading v2_duels (settled)…");
const { data: duels, error: duelsErr } = await sb
  .from("v2_duels")
  .select(
    "id,status,winner_address,player1_address,player2_address,player1_submitted_at,player2_submitted_at,settled_at,plausibility_check",
  )
  .eq("status", "settled");
if (duelsErr) {
  console.error("failed to read v2_duels:", duelsErr);
  process.exit(1);
}
if (duels && duels.length === 1000) {
  console.warn(
    "[backfill-sp] v2_duels returned exactly 1000 rows — likely paginated. Extend the script with offset/limit if row count grows.",
  );
}

for (const d of duels ?? []) {
  if (!d.winner_address || !d.player1_address) continue;
  const winner = getAddress(d.winner_address);
  const p1 = getAddress(d.player1_address);
  const p2 = d.player2_address ? getAddress(d.player2_address) : null;
  if (!p2) continue; // no opponent ever matched; shouldn't be status=settled

  const verdict =
    ((d.plausibility_check as { verdict?: Verdict } | null)?.verdict) ??
    "plausible";

  const winnerIsP1 = winner === p1;
  const loser = winnerIsP1 ? p2 : p1;
  const loserSubmittedAt = winnerIsP1
    ? d.player2_submitted_at
    : d.player1_submitted_at;
  const isWalkoverLoser = !loserSubmittedAt;

  const winEvent: SPEvent = { kind: "duel_win", verdict };
  bump(winner, awardSP(winEvent), { duels_won: 1 }, d.settled_at, "duel");

  if (!isWalkoverLoser) {
    const lossEvent: SPEvent = { kind: "duel_loss", verdict };
    bump(loser, awardSP(lossEvent), { duels_lost: 1 }, d.settled_at, "duel");
  }
}
console.log(`  duels processed: ${duels?.length ?? 0}`);

// ─── 2. solo runs ────────────────────────────────────────────────────────────
// For each solo run: submitter gets solo_submit (50 × multiplier). Paid
// retries use the SAME base as free submits per the sprint spec.

console.log("[backfill-sp] reading v2_tournament_solo_runs…");
const { data: runs, error: runsErr } = await sb
  .from("v2_tournament_solo_runs")
  .select("player_address,plausibility_check,submitted_at,excluded");
if (runsErr) {
  console.error("failed to read v2_tournament_solo_runs:", runsErr);
  process.exit(1);
}
if (runs && runs.length === 1000) {
  console.warn(
    "[backfill-sp] v2_tournament_solo_runs returned exactly 1000 rows — likely paginated.",
  );
}

for (const r of runs ?? []) {
  if (r.excluded) continue; // excluded by admin moderation — no SP
  const verdict =
    ((r.plausibility_check as { verdict?: Verdict } | null)?.verdict) ??
    "plausible";
  const ev: SPEvent = { kind: "solo_submit", verdict };
  bump(r.player_address, awardSP(ev), {}, r.submitted_at, "solo");
}
console.log(`  solo runs processed: ${runs?.length ?? 0}`);

// ─── 3. tournament rank bonuses ──────────────────────────────────────────────
// For each SETTLED tournament: sort non-excluded entries by effective_rank_score
// desc, assign ranks 1..N, award rank bonus + tournaments counters. Mirrors
// the runtime logic in packages/duel-backend/src/cron/tournaments.ts.

console.log("[backfill-sp] reading settled tournaments…");
const { data: tournaments, error: tErr } = await sb
  .from("v2_tournaments")
  .select("id,settled_at")
  .not("settled_at", "is", null);
if (tErr) {
  console.error("failed to read v2_tournaments:", tErr);
  process.exit(1);
}

for (const t of tournaments ?? []) {
  const { data: entries, error: eErr } = await sb
    .from("v2_tournament_entries")
    .select("player_address,effective_rank_score,excluded")
    .eq("tournament_id", t.id)
    .eq("excluded", false);
  if (eErr) {
    console.warn(`  skipping tournament ${t.id}: ${eErr.message}`);
    continue;
  }

  const ranked = (entries ?? [])
    .slice()
    .sort((a, b) => {
      // Parse as float — effective_rank_score is numeric(20,4) in PG;
      // Number() handles the ~1e15 precision we care about. BigInt
      // would be more precise but the runtime uses the same simple
      // compare and we mirror it here.
      const ea = Number(a.effective_rank_score);
      const eb = Number(b.effective_rank_score);
      if (ea === eb) return 0;
      return ea > eb ? -1 : 1;
    })
    .map((e) => e.player_address);

  for (let i = 0; i < ranked.length; i++) {
    const rank = i + 1;
    const ev: SPEvent = { kind: "tournament_rank_bonus", rank };
    bump(
      ranked[i],
      awardSP(ev),
      {
        tournaments_participated: 1,
        tournaments_won: rank === 1 ? 1 : 0,
      },
      t.settled_at,
      "rank_bonus",
    );
  }
}
console.log(`  settled tournaments processed: ${tournaments?.length ?? 0}`);

// ─── 4. upsert ───────────────────────────────────────────────────────────────

console.log(`[backfill-sp] upserting ${agg.size} users into v2_user_stats…`);

let upsertErrors = 0;
// Chunk upserts so we don't blow the PostgREST request budget on 10k+ rows.
const CHUNK = 500;
const entries = [...agg.entries()];
for (let i = 0; i < entries.length; i += CHUNK) {
  const chunk = entries.slice(i, i + CHUNK);
  const rows = chunk.map(([addr, v]) => ({
    user_address: addr,
    total_sp: v.total_sp,
    current_level: levelForSP(v.total_sp),
    duels_won: v.duels_won,
    duels_lost: v.duels_lost,
    tournaments_participated: v.tournaments_participated,
    tournaments_won: v.tournaments_won,
    // created_at is not touched on conflict so first-ever row captures the
    // actual creation time; last_active_at always gets the freshest from
    // source data.
    last_active_at: v.last_active_at,
  }));
  const { error: upErr } = await sb
    .from("v2_user_stats")
    .upsert(rows, { onConflict: "user_address" });
  if (upErr) {
    console.error(`  chunk ${i}..${i + chunk.length} failed:`, upErr.message);
    upsertErrors += chunk.length;
  }
}

// ─── 5. sanity report ────────────────────────────────────────────────────────

const values = Array.from(agg.values());
const totalSP = values.reduce((s, v) => s + v.total_sp, 0);
const fromDuel = values.reduce((s, v) => s + v.from_duel_sp, 0);
const fromSolo = values.reduce((s, v) => s + v.from_solo_sp, 0);
const fromRank = values.reduce((s, v) => s + v.from_rank_bonus_sp, 0);

console.log();
console.log("── backfill summary ──");
console.log(`  users backfilled:      ${agg.size}`);
console.log(`  upsert errors:         ${upsertErrors}`);
console.log(`  total SP distributed:  ${totalSP.toLocaleString()}`);
console.log(`    · from duel:         ${fromDuel.toLocaleString()}`);
console.log(`    · from solo submit:  ${fromSolo.toLocaleString()}`);
console.log(`    · from rank bonus:   ${fromRank.toLocaleString()}`);

process.exit(upsertErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[backfill-sp] fatal:", err);
  process.exit(1);
});
