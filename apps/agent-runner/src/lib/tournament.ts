import type { Game } from './wallet.js';

// API response shape verified by direct probe (Phase A scaffold smoke):
// GET /v1/tournaments → { items: TournamentApiRecord[], pagination: {...} }.
// camelCase keys, Unix-seconds timestamps.
//
// Page 1 currently fits all active daily tournaments (one per game). If active
// tournament count ever exceeds page size, this loader must paginate — Phase B
// follow-up.
interface TournamentApiRecord {
  id: string;
  sponsor: string;
  game: string;
  cycleType: number;
  startsAt: number;
  endsAt: number;
  prizePool: string;
  participationBonus: string;
  settled: boolean;
  participantsCount: number;
}

interface TournamentApiResponse {
  items: TournamentApiRecord[];
  pagination?: { next?: string };
}

// Safety cap: today ≈2 pages × 20 records = 40 tournaments across all games.
// Headroom for ~10× growth before this needs revisiting. If the API ever adds
// a working ?game= filter or sort-by-endsAt-desc, drop the loop in favor of
// a single targeted call.
const MAX_PAGES = 10;

const DEFAULT_BASE_URL = 'https://api.skillos.network';

export async function resolveTournament(game: Game): Promise<string> {
  const baseUrl = (process.env.SKILLOS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');

  const accumulated: TournamentApiRecord[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    const url = cursor
      ? `${baseUrl}/v1/tournaments?cursor=${encodeURIComponent(cursor)}`
      : `${baseUrl}/v1/tournaments`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`GET ${url} failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as TournamentApiResponse;
    if (!body || !Array.isArray(body.items)) {
      throw new Error(
        `Expected { items: [...] } from ${url}, got ${JSON.stringify(body).slice(0, 80)}`,
      );
    }
    accumulated.push(...body.items);
    cursor = body.pagination?.next;
    pages++;
  } while (cursor && pages < MAX_PAGES);

  if (cursor) {
    console.warn(
      `[tournament] reached MAX_PAGES=${MAX_PAGES} with cursor still present; result may be incomplete`,
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const candidate = accumulated
    .filter((t) => t.game === game && !t.settled && t.endsAt > nowSec)
    .sort((a, b) => a.endsAt - b.endsAt)[0];

  if (!candidate) {
    throw new Error(
      `No active tournament for game=${game} (scanned ${accumulated.length} records across ${pages} pages, now=${nowSec})`,
    );
  }
  return candidate.id;
}
