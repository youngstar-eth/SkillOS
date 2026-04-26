// ───────────────────────────────────────────────────────────────────────────
// x402-paid endpoint — $0.05 USDC per call.
// AI Coach sample — 2 improvement areas + 1 actionable tip. Reuses the
// @skillbase/ai-coach solo-coach pipeline (same Anthropic client, same
// strict 6-tone enum, same retry-then-hide-badge graceful degradation).
//
// Flow:
//   withX402   — verify payment (runs inner on success, settles after)
//   inner      — rate-limit (payment already taken), parse params,
//                call coach, reshape feedback into spec schema
//
// On rate-limit hit after successful payment: 429 with non-refund note.
// Settlement still runs (per spec: payment non-refundable in sample tier).
// On Anthropic error: 502 (upstream coach failure), settle still runs.
// ───────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import {
  generateSoloCoachFeedback,
  type CoachResponse,
  type GameType,
} from "@skillbase/ai-coach";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { withX402 } from "@/lib/x402-handle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_TO_GAMETYPE: Record<string, GameType> = {
  "2048": "game2048",
  wordle: "wordle",
  sudoku: "sudoku",
  minesweeper: "minesweeper",
  clicker: "clicker",
  match3: "match3",
};

interface ParsedFeedback {
  area1: { title: string; body: string };
  area2: { title: string; body: string };
  tip: string;
}

/**
 * Split the coach's single `feedback` string into the structured schema
 * the sample endpoint exposes. The solo-coach prompt produces exactly
 * "Area 1: TITLE — BODY. Area 2: TITLE — BODY. Tip: BODY." so this is a
 * 3-regex walk. On any parse miss we fall through to conservative
 * defaults so the response shape is always complete.
 */
function parseCoachFeedback(feedback: string): ParsedFeedback {
  const sep = "(?:—|–|-{1,2})";
  const area1Re = new RegExp(
    `Area\\s*1\\s*:\\s*([^—–\\-]+?)\\s*${sep}\\s*(.+?)(?=\\s*Area\\s*2\\s*:|\\s*Tip\\s*:|$)`,
    "is",
  );
  const area2Re = new RegExp(
    `Area\\s*2\\s*:\\s*([^—–\\-]+?)\\s*${sep}\\s*(.+?)(?=\\s*Tip\\s*:|$)`,
    "is",
  );
  const tipRe = /Tip\s*:\s*(.+?)$/is;

  const a1 = feedback.match(area1Re);
  const a2 = feedback.match(area2Re);
  const tip = feedback.match(tipRe);

  return {
    area1: {
      title: a1?.[1]?.trim() ?? "Consistency",
      body: a1?.[2]?.replace(/\s+/g, " ").trim() ?? feedback.trim(),
    },
    area2: {
      title: a2?.[1]?.trim() ?? "Recovery",
      body: a2?.[2]?.replace(/\s+/g, " ").trim() ?? "",
    },
    tip: tip?.[1]?.replace(/\s+/g, " ").trim() ?? "Keep your pacing even.",
  };
}

function error(code: string, message: string, status: number) {
  return NextResponse.json({ error: code, message }, { status });
}

export const GET = withX402(async (request: NextRequest) => {
  const ip = clientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        message:
          "Rate limit exceeded; payment is non-refundable in sample tier. Contact sales@simpl3.ai for production access.",
        retry_after_seconds: rl.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  const gameParam = request.nextUrl.searchParams.get("game");
  const scoreParam = request.nextUrl.searchParams.get("score");
  if (!gameParam || !scoreParam) {
    return error("missing_params", "game and score query params are required", 400);
  }
  const gameType = SLUG_TO_GAMETYPE[gameParam];
  if (!gameType) {
    return error(
      "invalid_game",
      `game must be one of: ${Object.keys(SLUG_TO_GAMETYPE).join(", ")}`,
      400,
    );
  }
  const score = Number(scoreParam);
  if (!Number.isFinite(score) || score < 0) {
    return error("invalid_score", "score must be a non-negative integer", 400);
  }

  let coach: CoachResponse;
  try {
    coach = await generateSoloCoachFeedback({
      gameType,
      score: Math.floor(score),
      durationSeconds: 0,
    });
  } catch (err) {
    console.error("[coach-sample] Anthropic call failed", err);
    return NextResponse.json(
      {
        error: "coach_upstream_failure",
        message:
          "Coach inference failed. Payment is non-refundable in sample tier. Contact sales@simpl3.ai.",
      },
      { status: 502 },
    );
  }

  const parsed = parseCoachFeedback(coach.feedback);
  // tone="encouraging" is the hide-badge sentinel from the solo pipeline.
  // Per spec: on enum violation we hide tone rather than mislabel it.
  const includeTone = coach.tone !== "encouraging";

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    game: gameParam,
    score_analyzed: Math.floor(score),
    coach_verdict: {
      improvement_area_1: {
        area: parsed.area1.title,
        ...(includeTone ? { tone: coach.tone } : {}),
        observation: parsed.area1.body,
      },
      improvement_area_2: {
        area: parsed.area2.title,
        ...(includeTone ? { tone: coach.tone } : {}),
        observation: parsed.area2.body,
      },
      actionable_tip: parsed.tip,
    },
    meta: {
      model: "claude-sonnet-4-6-via-skillbase",
      sample_note:
        "Same Coach pipeline as live Skillbase games. For production SDK access with tier-aware prompts and volume pricing, contact sales@simpl3.ai.",
      rate_limit_note: "Sample endpoint — 30 req/min per IP.",
    },
  });
});
