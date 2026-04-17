/**
 * Type-level tests — compile-time only, never executed.
 *
 * These assertions verify that queries through the typed Supabase clients
 * narrow to the exact Row types emitted by `supabase gen types typescript`.
 * If the generated types drift or a client drops its generic, tsc fails.
 */
import type { Database } from "@mas/shared/supabase";
import { createClient } from "@mas/shared/supabase";
import { createAdminSupabase } from "@mas/shared/supabase";

type UsersRow = Database["public"]["Tables"]["users"]["Row"];
type SessionsRow = Database["public"]["Tables"]["game_sessions"]["Row"];
type LeaderboardRow = Database["public"]["Views"]["leaderboard"]["Row"];

// --- Expect<Equal<X, Y>> helper -------------------------------------------
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

// --- 1. Browser client: .select('*') on users resolves to UsersRow[] -------
async function _testBrowserUsers() {
  const supabase = createClient();
  const { data } = await supabase.from("users").select("*");
  type Got = NonNullable<typeof data>[number];
  type _ok = Expect<Equal<Got, UsersRow>>;
  // Field-level probe — these must be exact primitives, not `any`.
  const _walletIsString: string = data![0]!.wallet_address;
  const _fidIsNullableNumber: number | null = data![0]!.fid;
  void _walletIsString;
  void _fidIsNullableNumber;
}

// --- 2. .single() narrows to UsersRow (non-array, nullable) ----------------
async function _testBrowserSingle() {
  const supabase = createClient();
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("wallet_address", "0xdeadbeef")
    .single();
  type Got = NonNullable<typeof data>;
  type _ok = Expect<Equal<Got, UsersRow>>;
}

// --- 3. Admin client write: Insert payload matches generated Insert --------
async function _testAdminInsert() {
  const admin = createAdminSupabase();
  const insert: Database["public"]["Tables"]["game_sessions"]["Insert"] = {
    user_id: "00000000-0000-0000-0000-000000000000",
    score: 2048,
    max_tile: 2048,
    moves: 500,
    won: true,
  };
  const { data } = await admin.from("game_sessions").insert(insert).select().single();
  type Got = NonNullable<typeof data>;
  type _ok = Expect<Equal<Got, SessionsRow>>;
}

// --- 4. Leaderboard view row matches generated View Row --------------------
async function _testLeaderboardView() {
  const supabase = createClient();
  const { data } = await supabase.from("leaderboard").select("*").limit(10);
  type Got = NonNullable<typeof data>[number];
  type _ok = Expect<Equal<Got, LeaderboardRow>>;
  // View columns are all nullable (LEFT JOIN semantics).
  const _bestScore: number | null = data![0]!.best_score;
  void _bestScore;
}

// --- 5. upsert_user RPC: Args + Return typed correctly ---------------------
async function _testUpsertUserRpc() {
  const admin = createAdminSupabase();
  const { data } = await admin.rpc("upsert_user", {
    p_wallet: "0xdeadbeef",
    p_fid: 12345,
  });
  type Got = typeof data;
  type _ok = Expect<Equal<Got, string | null>>;
}
