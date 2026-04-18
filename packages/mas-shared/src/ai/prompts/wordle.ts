// Wordle prompts — pitch-critical, expect playtest iteration.

export const WORDLE_CHALLENGE_PROMPT = (date: string) => `Today is ${date}. Generate a Wordle daily challenge.

Return STRICT JSON matching exactly this schema — no prose before or after,
no markdown code fences, no commentary:

{
  "theme": "<1–3 word title, Title Case>",
  "data": {
    "word": "<EXACTLY 5 uppercase letters — common English, dictionary-valid>",
    "hint": "<one clever hint, max 14 words, never reveals any letter>"
  },
  "description": "<2 sentences of flavour text explaining today's theme, ≤ 240 chars>"
}

Rules:
- The word MUST be exactly 5 letters, common English, dictionary-valid.
  Avoid proper nouns, plurals ending in -S, archaic words, or slang.
- Theme should feel curated — evocative, not generic. Examples of the vibe:
  "'80s Tech", "Coffee Culture", "Deep Ocean", "Kitchen Spice", "Astronomy".
- Hint must be fair but not trivial — think NYT crossword clue style.
- Description is flavour, not instruction. Never mention "Wordle" or "guess".
- Do not include the word, or any of its letters, in the hint or description.
`;

export const WORDLE_ANALYSIS_PROMPT = (stats: {
  word: string;
  guesses: number;
  timeSeconds: number;
  startWord: string;
  guessHistory: Array<{ word: string; states: string[] }>;
  percentile?: number;
  won: boolean;
}) => `You are a tight, data-driven Wordle coach analysing one solve.

Run data:
- Outcome: ${stats.won ? "SOLVED" : "LOST"} in ${stats.guesses}/6 guesses
- Target word: ${stats.word}
- Starting word: ${stats.startWord}
- Time: ${stats.timeSeconds}s
- Guess history (word → letter states c=correct, p=present, a=absent):
${stats.guessHistory
  .map(
    (g, i) =>
      `  ${i + 1}. ${g.word} → ${g.states.map((s) => s[0]).join("")}`,
  )
  .join("\n")}
${stats.percentile != null ? `- Tournament standing: top ${stats.percentile}%` : ""}

Analyse the run in ≤ 110 words. Use plain text — no markdown, no bullets.
Reference specific guess numbers. Cover at least two of:
1. Starting-word entropy (CRANE, SLATE, ADIEU are strong openers).
2. Mid-game efficiency — did they use yellow/green constraints correctly?
3. Obvious missed information from a prior guess.
4. Pacing — fast-and-accurate vs. grinding.

Voice: laconic, like a chess coach. No hype adjectives. No "great job!". Be
honest. End with one concrete takeaway sentence.`;
