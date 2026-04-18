// Central catalog of skillbase games.
// Each app keeps its own app-config.ts for manifest/embed fields; this
// catalog is the source of truth for the landing page, cross-promos,
// and any shared component that needs to list every game.

export type GameCategory =
  | "puzzle"
  | "arcade"
  | "casual"
  | "action"
  | "strategy";

export interface GameConfig {
  /** URL-safe slug matching the `apps/<slug>` directory. */
  slug: string;
  /** Display title, matches app-config.title. */
  title: string;
  /** Short pitch, "<Aesthetic> on Base". */
  subtitle: string;
  /** One-sentence description, matches app-config.description. */
  description: string;
  /** Aesthetic label (e.g. "Dieselpunk"), extracted from subtitle. */
  aesthetic: string;
  /** On-chain tournament ID (ArcadePool). */
  tournamentId: number;
  /** Per-game entry fee, currently uniform across the catalog. */
  entryFee: string;
  /** Primary accent color in hex (from globals.css --color-accent). */
  accentColor: string;
  /** Background/splash color in hex (from app-config.splashBg). */
  splashBg: string;
  /** Broad category for filtering. */
  category: GameCategory;
  /** Tags copied from each app's app-config. */
  tags: readonly string[];
  /** Play URL — production skillbase.games subdomain. */
  playUrl: string;
}

const make = (g: GameConfig): GameConfig => g;

export const GAMES: readonly GameConfig[] = [
  make({
    slug: "2048",
    title: "2048",
    subtitle: "Bauhaus on Base",
    aesthetic: "Bauhaus",
    description:
      "Classic 2048 with a Bauhaus palette. Slide, merge, win. Part of skillbase.",
    tournamentId: 0,
    entryFee: "1 USDC",
    accentColor: "#ED0015",
    splashBg: "#FFFBEB",
    category: "puzzle",
    tags: ["skillbase", "arcade", "puzzle", "onchain"],
    playUrl: "https://2048.skillbase.games",
  }),
  make({
    slug: "breakout",
    title: "Breakout",
    subtitle: "Y2K on Base",
    aesthetic: "Y2K",
    description: "Y2K-era Breakout. Chip away and win. Part of skillbase.",
    tournamentId: 7,
    entryFee: "1 USDC",
    accentColor: "#52AEFF",
    splashBg: "#B4E1FF",
    category: "arcade",
    tags: ["skillbase", "arcade", "onchain"],
    playUrl: "https://breakout.skillbase.games",
  }),
  make({
    slug: "bubble",
    title: "Bubble",
    subtitle: "Soft on Base",
    aesthetic: "Soft Pastel",
    description:
      "Soft-pastel bubble shooter. Match three. Part of skillbase.",
    tournamentId: 8,
    entryFee: "1 USDC",
    accentColor: "#FF6496",
    splashBg: "#FDF4FF",
    category: "puzzle",
    tags: ["skillbase", "puzzle", "match3", "onchain"],
    playUrl: "https://bubble.skillbase.games",
  }),
  make({
    slug: "clicker",
    title: "Clicker",
    subtitle: "Maximalist on Base",
    aesthetic: "Maximalist",
    description:
      "Tap, upgrade, overflow. Maximalist idle clicker. Part of skillbase.",
    tournamentId: 6,
    entryFee: "1 USDC",
    accentColor: "#5A845C",
    splashBg: "#FFE5E5",
    category: "casual",
    tags: ["skillbase", "idle", "arcade", "onchain"],
    playUrl: "https://clicker.skillbase.games",
  }),
  make({
    slug: "crossy",
    title: "Crossy",
    subtitle: "Pixel 8-bit on Base",
    aesthetic: "Pixel 8-bit",
    description:
      "8-bit road crosser. Dodge cars, hop logs. Part of skillbase.",
    tournamentId: 11,
    entryFee: "1 USDC",
    accentColor: "#FFEC27",
    splashBg: "#1D2B53",
    category: "arcade",
    tags: ["skillbase", "arcade", "endless", "onchain"],
    playUrl: "https://crossy.skillbase.games",
  }),
  make({
    slug: "flappy",
    title: "Flappy",
    subtitle: "Dreamcore on Base",
    aesthetic: "Dreamcore",
    description: "Dreamcore Flappy. Flap through the pipes. Part of skillbase.",
    tournamentId: 18,
    entryFee: "1 USDC",
    accentColor: "#FFA0C8",
    splashBg: "#EBDCFA",
    category: "arcade",
    tags: ["skillbase", "arcade", "endless", "onchain"],
    playUrl: "https://flappy.skillbase.games",
  }),
  make({
    slug: "geometry",
    title: "Geometry",
    subtitle: "Glitchcore on Base",
    aesthetic: "Glitchcore",
    description:
      "Glitchcore runner. One button, no forgiveness. Part of skillbase.",
    tournamentId: 12,
    entryFee: "1 USDC",
    accentColor: "#00F0FF",
    splashBg: "#08080C",
    category: "action",
    tags: ["skillbase", "arcade", "rhythm", "onchain"],
    playUrl: "https://geometry.skillbase.games",
  }),
  make({
    slug: "helix",
    title: "Helix",
    subtitle: "Memphis on Base",
    aesthetic: "Memphis",
    description:
      "Memphis-style Helix Jump. Fall fast, chain combos. Part of skillbase.",
    tournamentId: 19,
    entryFee: "1 USDC",
    accentColor: "#FF3C64",
    splashBg: "#FFFAEB",
    category: "arcade",
    tags: ["skillbase", "arcade", "endless", "onchain"],
    playUrl: "https://helix.skillbase.games",
  }),
  make({
    slug: "hillclimb",
    title: "Hill Climb",
    subtitle: "Dieselpunk on Base",
    aesthetic: "Dieselpunk",
    description:
      "Dieselpunk hill climb. Manage fuel, dont flip. Part of skillbase.",
    tournamentId: 17,
    entryFee: "1 USDC",
    accentColor: "#C86E32",
    splashBg: "#323728",
    category: "arcade",
    tags: ["skillbase", "arcade", "physics", "onchain"],
    playUrl: "https://hillclimb.skillbase.games",
  }),
  make({
    slug: "jetpack",
    title: "Jetpack",
    subtitle: "Cybercore on Base",
    aesthetic: "Cybercore",
    description:
      "Cyber-grid Jetpack. Hold to thrust, dodge lasers. Part of skillbase.",
    tournamentId: 13,
    entryFee: "1 USDC",
    accentColor: "#00F0FF",
    splashBg: "#080A19",
    category: "arcade",
    tags: ["skillbase", "arcade", "endless", "onchain"],
    playUrl: "https://jetpack.skillbase.games",
  }),
  make({
    slug: "match3",
    title: "Match 3",
    subtitle: "Kidcore on Base",
    aesthetic: "Kidcore",
    description:
      "Kidcore Match-3. Chain combos, clear the board. Part of skillbase.",
    tournamentId: 10,
    entryFee: "1 USDC",
    accentColor: "#FF78B4",
    splashBg: "#FFFAEB",
    category: "puzzle",
    tags: ["skillbase", "match3", "puzzle", "onchain"],
    playUrl: "https://match3.skillbase.games",
  }),
  make({
    slug: "minesweeper",
    title: "Minesweeper",
    subtitle: "Retro on Base",
    aesthetic: "Retro",
    description:
      "Classic Minesweeper with a retro-Windows look. Part of skillbase.",
    tournamentId: 3,
    entryFee: "1 USDC",
    accentColor: "#FEFF58",
    splashBg: "#C0C0C0",
    category: "puzzle",
    tags: ["skillbase", "puzzle", "classic", "onchain"],
    playUrl: "https://minesweeper.skillbase.games",
  }),
  make({
    slug: "pong",
    title: "Pong",
    subtitle: "Arcade on Base",
    aesthetic: "Arcade",
    description: "The original Pong, on-chain. Best of three. Part of skillbase.",
    tournamentId: 5,
    entryFee: "1 USDC",
    accentColor: "#54AEFF",
    splashBg: "#000000",
    category: "arcade",
    tags: ["skillbase", "arcade", "classic", "onchain"],
    playUrl: "https://pong.skillbase.games",
  }),
  make({
    slug: "pool",
    title: "Pool",
    subtitle: "Dark Luxe on Base",
    aesthetic: "Dark Luxe",
    description:
      "Dark-luxe 8-ball. Clear the table, beat the clock. Part of skillbase.",
    tournamentId: 16,
    entryFee: "1 USDC",
    accentColor: "#C8AA64",
    splashBg: "#0F140F",
    category: "casual",
    tags: ["skillbase", "sports", "classic", "onchain"],
    playUrl: "https://pool.skillbase.games",
  }),
  make({
    slug: "snake",
    title: "Snake",
    subtitle: "Vaporwave on Base",
    aesthetic: "Vaporwave",
    description: "Vaporwave Snake. Grow, turn, survive. Part of skillbase.",
    tournamentId: 2,
    entryFee: "1 USDC",
    accentColor: "#AFE5DD",
    splashBg: "#0D0221",
    category: "arcade",
    tags: ["skillbase", "arcade", "onchain"],
    playUrl: "https://snake.skillbase.games",
  }),
  make({
    slug: "solitaire",
    title: "Solitaire",
    subtitle: "Dark Academia on Base",
    aesthetic: "Dark Academia",
    description:
      "Klondike solitaire with Dark Academia mood. Part of skillbase.",
    tournamentId: 9,
    entryFee: "1 USDC",
    accentColor: "#C49A5E",
    splashBg: "#1E1916",
    category: "puzzle",
    tags: ["skillbase", "classic", "cards", "onchain"],
    playUrl: "https://solitaire.skillbase.games",
  }),
  make({
    slug: "stickman",
    title: "Stickman",
    subtitle: "Grunge on Base",
    aesthetic: "Grunge",
    description:
      "Grunge stickman swing. Hook, release, fly. Part of skillbase.",
    tournamentId: 14,
    entryFee: "1 USDC",
    accentColor: "#B4503C",
    splashBg: "#231E19",
    category: "action",
    tags: ["skillbase", "arcade", "physics", "onchain"],
    playUrl: "https://stickman.skillbase.games",
  }),
  make({
    slug: "sudoku",
    title: "Sudoku",
    subtitle: "Newspaper on Base",
    aesthetic: "Newspaper",
    description:
      "Sudoku with newspaper typography. Nine cells at a time. Part of skillbase.",
    tournamentId: 4,
    entryFee: "1 USDC",
    accentColor: "#635BFF",
    splashBg: "#F5F1E8",
    category: "puzzle",
    tags: ["skillbase", "puzzle", "logic", "onchain"],
    playUrl: "https://sudoku.skillbase.games",
  }),
  make({
    slug: "tower",
    title: "Tower",
    subtitle: "Steampunk on Base",
    aesthetic: "Steampunk",
    description:
      "Steampunk tower defense. Ten waves, one path. Part of skillbase.",
    tournamentId: 15,
    entryFee: "1 USDC",
    accentColor: "#C88C3C",
    splashBg: "#2D1E14",
    category: "strategy",
    tags: ["skillbase", "strategy", "td", "onchain"],
    playUrl: "https://tower.skillbase.games",
  }),
  make({
    slug: "wordle",
    title: "Wordle",
    subtitle: "Linear on Base",
    aesthetic: "Linear",
    description:
      "Five letters, six guesses. Linear-minimal Wordle on Base. Part of skillbase.",
    tournamentId: 1,
    entryFee: "1 USDC",
    accentColor: "#7170FF",
    splashBg: "#FFFFFF",
    category: "puzzle",
    tags: ["skillbase", "puzzle", "daily", "onchain"],
    playUrl: "https://wordle.skillbase.games",
  }),
];

export const getGame = (slug: string): GameConfig | undefined =>
  GAMES.find((g) => g.slug === slug);

// Alias kept for forward-compat with older callsites.
export const getGameBySlug = getGame;
