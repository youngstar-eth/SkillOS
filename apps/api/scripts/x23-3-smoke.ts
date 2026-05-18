// X23.3 smoke — runs the 3 rating endpoints in-process against the
// configured Supabase, no dev server required.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx apps/api/scripts/x23-3-smoke.ts
//
// Or source env from an existing app's .env file:
//   set -a; source apps/2048/.env.production.local; set +a
//   export SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
//   npx tsx apps/api/scripts/x23-3-smoke.ts

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.',
  );
  console.error('See script header for usage.');
  process.exit(1);
}

// Unrelated stubs so unrelated middleware (x402, SIWA, JWT) doesn't throw
// at app-boot time. The rating endpoints don't use any of these subsystems.
process.env.SIWA_RECEIPT_SECRET ??= 'a'.repeat(32);
process.env.JWT_SECRET ??= 'a'.repeat(32);
process.env.X402_RECEIVER_ADDRESS ??= '0x000000000000000000000000000000000000dEaD';

const { default: app } = await import('../src/app.js');

async function hit(path: string, label: string): Promise<void> {
  const res = await app.request(path);
  const text = await res.text();
  console.log(`\n── ${label} (HTTP ${res.status})`);
  console.log(`  GET ${path}`);
  try {
    const json = JSON.parse(text);
    console.log('  ' + JSON.stringify(json, null, 2).split('\n').join('\n  '));
  } catch {
    console.log('  ' + text);
  }
}

// Known-good post-X23.2 testnet data (Phase 1, Supabase project
// clizuqvtkekzxiflbsyr) used for development smoke. Replace with mainnet
// equivalents post-cutover.
const SAMPLE_TOP_WALLET = '0xB3696dF07Ce56dcaFbf62248da9c08b485A2bABC';
const SAMPLE_MULTI_HISTORY_WALLET =
  '0x352774c4f58b09d83e6F6B55b60dc8008342bc09';

await hit(`/v1/ratings/${SAMPLE_TOP_WALLET}`, 'getRatings: top-2048 wallet');
await hit(
  '/v1/ratings/leaderboard?game=2048&class=human&limit=5',
  'getLeaderboard: 2048 human top-5',
);
await hit(
  `/v1/ratings/history/${SAMPLE_MULTI_HISTORY_WALLET}?game=2048&class=human`,
  'getHistory: multi-update wallet',
);

// Cursor round-trip: page 1 with limit=2, then resume via emitted cursor.
const page1 = await app.request(
  '/v1/ratings/leaderboard?game=2048&class=human&limit=2',
);
const page1Json = (await page1.json()) as {
  rankings: Array<{ rank: number; wallet: string }>;
  pagination: { next?: string };
};
console.log('\n── Cursor round-trip: page 1 + page 2 (HTTP', page1.status + ')');
console.log(
  '  page 1 ranks:',
  page1Json.rankings.map((r) => `${r.rank}:${r.wallet.slice(0, 8)}…`).join(', '),
);
const next = page1Json.pagination.next;
if (next) {
  const page2 = await app.request(
    `/v1/ratings/leaderboard?game=2048&class=human&limit=2&cursor=${encodeURIComponent(next)}`,
  );
  const page2Json = (await page2.json()) as {
    rankings: Array<{ rank: number; wallet: string }>;
  };
  console.log(
    '  page 2 ranks:',
    page2Json.rankings.map((r) => `${r.rank}:${r.wallet.slice(0, 8)}…`).join(', '),
  );
  const continuous =
    page2Json.rankings[0]?.rank === page1Json.rankings.at(-1)!.rank + 1;
  console.log('  rank continuity:', continuous ? 'OK' : 'BROKEN');
}
