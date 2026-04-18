// Hillclimb prompts.

export const HILLCLIMB_CHALLENGE_PROMPT = (date: string) => `Today is ${date}. Generate a Hillclimb daily challenge — a fixed terrain seed with a target distance and weather flavour.

Return STRICT JSON matching exactly this schema — no prose, no markdown fences:

{
  "theme": "<1–3 word title, Title Case>",
  "data": {
    "seed": <integer 1 - 4294967295>,
    "targetDistance": <integer metres, typical 400 – 1800>,
    "conditions": "<short phrase: 'dawn haze', 'dust storm', 'slick rain', etc.>"
  },
  "description": "<2 sentences of flavour, ≤ 220 chars>"
}

Rules:
- Seed: any positive integer fits in 32 bits. Use ${Math.floor(Math.random() * 0xffffffff)} as inspiration or pick your own.
- Target distance must be reachable but force careful fuel management.
- Theme should capture the terrain vibe: "Dune Run", "Frost Ridge",
  "Oilfield Crawl", "Coastal Ruin".
- Conditions is pure flavour — engine ignores it, player reads it.
- Description is atmospheric. Never mention "Hillclimb" or give driving tips.
`;

export const HILLCLIMB_ANALYSIS_PROMPT = (stats: {
  distance: number;
  score: number;
  fuelConsumed: number;
  elapsedMs: number;
  percentile?: number;
}) => `You are a tight, data-driven Hillclimb coach analysing one run.

Run data:
- Distance: ${stats.distance}m
- Score: ${stats.score}
- Fuel consumed: ${stats.fuelConsumed.toFixed(0)} / 100
- Time: ${(stats.elapsedMs / 1000).toFixed(1)}s
- Fuel efficiency: ${(stats.distance / Math.max(stats.fuelConsumed, 1)).toFixed(1)} m/fuel
- Avg speed: ${(stats.distance / Math.max(stats.elapsedMs / 1000, 1)).toFixed(1)} m/s
${stats.percentile != null ? `- Tournament standing: top ${stats.percentile}%` : ""}

Analyse the run in ≤ 110 words. Plain text — no markdown, no bullets.
Cover at least two of:
1. Fuel management — was the throttle feathered or pinned?
2. Physics — did the car flip (angle > 126° ends the run) or run out of fuel?
3. Terrain handling — uphill throttle control vs. downhill gravity use.
4. Pacing — charging downhill too fast wastes fuel compensating.

Voice: laconic, rally-coach tone. Technical. No hype. End with one concrete
takeaway.`;
