import { NextResponse, type NextRequest } from "next/server";
import { verifyBearer } from "../quick-auth";
import { createAdminSupabase } from "../../supabase/server";

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

type UpsertBody = {
  walletAddress?: unknown;
  fid?: unknown;
  username?: unknown;
  displayName?: unknown;
  pfpUrl?: unknown;
};

/** Shared `/api/user/upsert` POST handler. Writes user row via RPC. */
export async function userUpsertHandler(req: NextRequest) {
  const auth = await verifyBearer(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: UpsertBody;
  try {
    body = (await req.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const wallet =
    typeof body.walletAddress === "string" ? body.walletAddress.trim() : "";
  if (!WALLET_RE.test(wallet)) {
    return NextResponse.json({ error: "invalid_wallet" }, { status: 400 });
  }

  if (typeof body.fid === "number" && body.fid !== auth.fid) {
    return NextResponse.json({ error: "fid_mismatch" }, { status: 403 });
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("upsert_user", {
    p_wallet: wallet.toLowerCase(),
    p_fid: auth.fid,
    p_username:
      typeof body.username === "string" ? body.username : undefined,
    p_display_name:
      typeof body.displayName === "string" ? body.displayName : undefined,
    p_pfp_url: typeof body.pfpUrl === "string" ? body.pfpUrl : undefined,
  });

  if (error) {
    return NextResponse.json(
      { error: "db_error", detail: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true, userId: data });
}
