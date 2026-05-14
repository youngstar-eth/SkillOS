// Agent move generator — Sprint X20 solo spectator MVP.
//
// Wraps Anthropic Messages API with tool_use for structured-output guarantee.
// The agent receives current board + score + last few moves and is forced to
// call `make_move` with a typed direction + free-text reasoning. Tool-use
// schema enforcement removes the parse-failure class entirely (no regex on
// model text) — the only failure modes are SDK/network errors, handled by
// the orchestrator with a fallback baseline move.

import type Anthropic from '@anthropic-ai/sdk';
import { AGENT_MATCH_MODEL, getAnthropicClient } from './anthropic-client.js';
import { type Board, type Direction, legalMoves } from './game-2048.js';

export interface AgentMoveResult {
  direction: Direction;
  reasoning: string;
  latencyMs: number;
}

const SYSTEM_PROMPT = `You are an expert 2048 player competing in a verifiable on-chain tournament.

Your goal: maximize the final score (sum of all merge values) before the board fills with no legal moves.

Strategy guidance:
- Keep your largest tile pinned to a corner (canonical: bottom-right).
- Prefer moves that grow a chain along one row/column toward the corner.
- Avoid moves that split your largest tile away from the corner.
- Only break the corner-pinning when forced (no other legal move).

For each turn you will be shown the board, current score, and your recent moves. Call the make_move tool with:
- direction: one of "up", "down", "left", "right" — MUST be a legal move
- reasoning: 1-2 short sentences explaining your choice (will be shown to spectators)`;

const MAKE_MOVE_TOOL: Anthropic.Tool = {
  name: 'make_move',
  description: 'Submit your next 2048 move with a short rationale.',
  input_schema: {
    type: 'object' as const,
    properties: {
      direction: {
        type: 'string',
        enum: ['up', 'down', 'left', 'right'],
        description: 'The cardinal direction to slide tiles. Must be a legal move on the current board.',
      },
      reasoning: {
        type: 'string',
        description: 'One or two sentences explaining the choice. Visible to spectators.',
      },
    },
    required: ['direction', 'reasoning'],
  },
};

function renderBoardAscii(board: Board): string {
  const cellW = 5;
  const rule = `+${'-'.repeat(cellW).repeat(4).replace(/-/g, '-')}`.padEnd(
    1 + (cellW + 1) * 4,
    '-',
  ) + '+';
  const lines: string[] = [rule];
  for (const row of board) {
    const cells = row
      .map((v) => (v === 0 ? '.' : String(v)).padStart(cellW - 1).padStart(cellW))
      .join('|');
    lines.push(`|${cells}|`);
    lines.push(rule);
  }
  return lines.join('\n');
}

export interface AgentMoveContext {
  board: Board;
  cumulativeScore: number;
  moveNumber: number;
  /** Last up-to-5 directions the agent played (oldest first). */
  recentMoves: Direction[];
}

export async function getNextMove(ctx: AgentMoveContext): Promise<AgentMoveResult> {
  const legal = legalMoves(ctx.board);
  if (legal.length === 0) {
    throw new Error('No legal moves — orchestrator should detect game-over before calling getNextMove');
  }

  const client = getAnthropicClient();
  const ascii = renderBoardAscii(ctx.board);
  const matrix = JSON.stringify(ctx.board);
  const recent = ctx.recentMoves.length > 0 ? ctx.recentMoves.join(' → ') : '(first move)';

  const userMessage = `Move ${ctx.moveNumber}. Score: ${ctx.cumulativeScore}.

Board (numeric matrix): ${matrix}

Board (visual):
${ascii}

Legal moves this turn: ${legal.join(', ')}.
Recent moves: ${recent}.

Call make_move with your choice.`;

  const start = Date.now();
  const response = await client.messages.create({
    model: AGENT_MATCH_MODEL,
    max_tokens: 400,
    temperature: 0.4,
    system: SYSTEM_PROMPT,
    tools: [MAKE_MOVE_TOOL],
    tool_choice: { type: 'tool', name: 'make_move' },
    messages: [{ role: 'user', content: userMessage }],
  });
  const latencyMs = Date.now() - start;

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Anthropic response missing tool_use block — unexpected for forced tool_choice');
  }
  const input = toolUse.input as { direction?: string; reasoning?: string };
  const direction = input.direction as Direction | undefined;
  const reasoning = (input.reasoning ?? '').slice(0, 4000);

  if (!direction || !['up', 'down', 'left', 'right'].includes(direction)) {
    throw new Error(`Anthropic returned invalid direction: ${String(direction)}`);
  }
  if (!legal.includes(direction)) {
    // Model picked an illegal move — fall back to first legal direction with a
    // synthesized note. Better than aborting the match.
    return {
      direction: legal[0],
      reasoning: `(Fallback: model picked illegal ${direction}; chose ${legal[0]} instead.) ${reasoning}`,
      latencyMs,
    };
  }

  return { direction, reasoning, latencyMs };
}
