import { GAMES, type GameConfig } from "@mas/shared/games";
import { ThemeToggle } from "./theme-toggle";

// -----------------------------------------------------------------------------
// Live vs. Soon — marketing rollout, independent of actual deploy status.
// All 20 games are deployed; this list controls what the landing advertises
// as "live" vs "soon". Update here to promote games into the live row.
// -----------------------------------------------------------------------------
const LIVE_GAMES = new Set(["2048", "wordle", "snake", "minesweeper"]);

// Hero PNGs shipped in the design bundle. Everything else falls back to a
// colored placeholder tile.
const HERO_SLUGS = new Set([
  "2048", "wordle", "snake", "minesweeper",
  "sudoku", "pong", "breakout", "flappy",
  "helix", "tower", "match3", "bubble",
  "solitaire", "clicker",
]);

// Placeholder fill colors for the 6 games without hero art. Taken from the
// design file so we match the handoff visually.
const PLACEHOLDER: Record<string, { bg: string; fg: string }> = {
  crossy:    { bg: "#FFC72C", fg: "#0A0B0D" },
  geometry:  { bg: "#0052FF", fg: "#FFFFFF" },
  jetpack:   { bg: "#34D378", fg: "#0A0B0D" },
  stickman:  { bg: "#ED445A", fg: "#FFFFFF" },
  pool:      { bg: "#B7D5D5", fg: "#0A0B0D" },
  hillclimb: { bg: "#FFA070", fg: "#0A0B0D" },
};

function gameArt(game: GameConfig) {
  if (HERO_SLUGS.has(game.slug)) {
    return (
      <img src={`/assets/${game.slug}-hero.png`} alt={game.title} />
    );
  }
  const p = PLACEHOLDER[game.slug] ?? { bg: "#FFC72C", fg: "#0A0B0D" };
  return (
    <div className="art-placeholder">
      <div
        className="tile"
        style={{ background: p.bg, color: p.fg }}
      >
        {game.title}
      </div>
    </div>
  );
}

// Landing rank order — matches the design (live first, then soon in the order
// the designer laid them out in the handoff).
const LANDING_ORDER = [
  "2048", "wordle", "snake", "minesweeper",
  "sudoku", "pong", "breakout", "flappy",
  "helix", "tower", "match3", "bubble",
  "solitaire", "clicker",
  "crossy", "geometry", "jetpack", "stickman",
  "pool", "hillclimb",
];

function rankedGames(): GameConfig[] {
  const bySlug = new Map(GAMES.map((g) => [g.slug, g]));
  return LANDING_ORDER
    .map((s) => bySlug.get(s))
    .filter((g): g is GameConfig => Boolean(g));
}

export default function LandingPage() {
  const games = rankedGames();

  return (
    <>
      {/* =================== TOP NAV =================== */}
      <header className="topnav">
        <div className="wrap inner">
          <a href="#" className="brand" aria-label="skillbase home">
            <img src="/assets/sb-monogram.svg" alt="skillbase" />
            <div className="wm">
              skillbase
              <small>skill market on Base</small>
            </div>
          </a>
          <nav className="nav">
            <a href="#games">Arcade</a>
            <a href="#ai">AI</a>
            <a href="#how">How it works</a>
            <a className="mono" href="#">Docs ↗</a>
          </nav>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <ThemeToggle />
            <a href="#games" className="btn btn-primary btn-pill">
              Start playing
            </a>
          </div>
        </div>
      </header>

      {/* =================== HERO =================== */}
      <section className="hero">
        <div className="wrap inner">
          <div>
            <div className="eyebrow">v0 · Base Sepolia · live now</div>
            <h1>
              Classic arcade.
              <br />
              <span className="y">Real-money</span> tournaments{" "}
              <span className="b">on Base.</span>
            </h1>
            <p className="lede">
              Twenty mini-apps, one shared pool. Pay 1 USDC to enter, play
              for 24 hours, scores are signed server-side and submitted
              on-chain. No custodians, no take rate.
            </p>
            <div className="cta-row">
              <a href="#games" className="btn btn-primary btn-lg">
                Start playing <span className="arrow">→</span>
              </a>
              <a href="#how" className="btn btn-ghost btn-lg">
                How it works
              </a>
              <span className="chain-note">chainId 84532</span>
            </div>
          </div>

          {/* Hero scoreboard / pitch tile */}
          <div className="pitch" aria-label="Example tournament state">
            <div className="pitch-hd">
              <div className="game-ttl">
                2048 · Tournament #0
                <small>ENDS IN 04:12:38</small>
              </div>
              <div className="mono-pill">#base-sepolia</div>
            </div>
            <div className="stats">
              <div className="stat-tile hero-stat">
                <div className="k">Pool</div>
                <div className="v">
                  1,428<small>USDC</small>
                </div>
              </div>
              <div className="stat-tile plain">
                <div className="k">Players</div>
                <div className="v">147</div>
              </div>
              <div className="stat-tile plain">
                <div className="k">Best</div>
                <div className="v">34,128</div>
              </div>
            </div>
            <div className="sig-row">
              <span>
                <b>sig</b> 0xa14c…c71f
              </span>
              <span className="ok">✓ on-chain</span>
            </div>
          </div>
        </div>
      </section>

      {/* =================== PROOF STRIP =================== */}
      <div className="wrap">
        <div className="proof">
          <div className="cell">
            <div className="k">Games live</div>
            <div className="v">
              20<small>/100</small>
            </div>
          </div>
          <div className="cell">
            <div className="k">Active pools</div>
            <div className="v">
              8,429<small>USDC</small>
            </div>
          </div>
          <div className="cell">
            <div className="k">Scores submitted</div>
            <div className="v">12,408</div>
          </div>
          <div className="cell">
            <div className="k">Median entry</div>
            <div className="v">
              1.00<small>USDC</small>
            </div>
          </div>
        </div>
      </div>

      {/* =================== GAME GRID =================== */}
      <section className="band" id="games">
        <div className="wrap">
          <div className="sec-hd">
            <div>
              <div className="eyebrow">Play now</div>
              <h2>Twenty arcade classics. One pool.</h2>
            </div>
            <p className="rhs">
              Each game ships as a Base mini-app and runs in-frame. Enter
              once per tournament; your high score is signed by our oracle
              and submitted to{" "}
              <span
                className="mono"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              >
                ArcadePool.sol
              </span>
              .
            </p>
          </div>

          <div className="games">
            {games.map((game) => {
              const isLive = LIVE_GAMES.has(game.slug);
              return (
                <a
                  key={game.slug}
                  className="game"
                  data-status={isLive ? "live" : "soon"}
                  href={isLive ? game.playUrl : "#"}
                  target={isLive ? "_blank" : undefined}
                  rel={isLive ? "noopener" : undefined}
                >
                  <div className="art">
                    {gameArt(game)}
                    <span
                      className={`status ${isLive ? "live" : "soon"}`}
                    >
                      {isLive ? "Live" : "Soon"}
                    </span>
                  </div>
                  <div className="meta">
                    <span className="name">{game.title}</span>
                    <span className="fee">
                      Entry · <b>{game.entryFee}</b>
                    </span>
                    <button className="play" type="button">
                      {isLive ? "Play →" : "Notify"}
                    </button>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* =================== HOW IT WORKS =================== */}
      <section className="band" id="how" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-hd">
            <div>
              <div className="eyebrow">How it works</div>
              <h2>Three steps. No signup.</h2>
            </div>
            <p className="rhs">
              Wallet-native end to end. No accounts, no email, no custody.
              Your high score lives in{" "}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              >
                ArcadePool.sol
              </span>{" "}
              — readable by anyone, claimable by you.
            </p>
          </div>

          <div className="steps">
            <div className="step">
              <div className="n">Step 01</div>
              <div className="illus illus-wallet">Base</div>
              <h3>Connect wallet</h3>
              <p>
                Any EVM wallet on Base Sepolia. Farcaster Quick Auth is
                wired if you&rsquo;re already signed in.
              </p>
              <div className="mono-snippet">
                <b>chainId</b> 84532
                <br />
                <b>status</b> <span className="g">connected ✓</span>
              </div>
            </div>

            <div className="step">
              <div className="n">Step 02</div>
              <div className="illus illus-coin">$</div>
              <h3>Pay entry</h3>
              <p>
                Approve once, enter per tournament. 1 USDC per game ·
                24-hour window · winner takes the pool.
              </p>
              <div className="mono-snippet">
                <b>approve</b> 1.00 USDC
                <br />
                <b>enter</b> tournament <span className="y">#0</span>
              </div>
            </div>

            <div className="step">
              <div className="n">Step 03</div>
              <div className="illus illus-chain">
                <div className="blk" />
                <div className="blk" />
                <div className="blk" />
                <div className="blk" />
                <div className="blk" />
                <div className="blk" />
                <div className="blk" />
                <div className="blk" />
                <div className="blk" />
              </div>
              <h3>Submit score</h3>
              <p>
                Play. Server signs your score via EIP-712. Call{" "}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                  }}
                >
                  submitScore()
                </span>{" "}
                on-chain — done.
              </p>
              <div className="mono-snippet">
                <b>score</b> 34,128
                <br />
                <b>tx</b> 0x8e4a…42c1 <span className="g">✓</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================== AI LAYER =================== */}
      <section className="band" id="ai" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-hd">
            <div>
              <div className="eyebrow">AI Layer</div>
              <h2>
                Claude curates the content. And grades your run.
              </h2>
            </div>
            <p className="rhs">
              Every morning, Claude Sonnet writes a themed challenge for each
              pilot game. Every game-over, Claude Haiku grades your run
              against the data — chess-coach tone, no hype adjectives.
            </p>
          </div>

          <div className="steps">
            <div className="step">
              <div className="n">Feature 01</div>
              <div className="illus" style={{ fontSize: 28 }} aria-hidden>
                🎯
              </div>
              <h3>Daily Challenges</h3>
              <p>
                Themed puzzle per game per day. Wordle gets a themed word,
                2048 gets a seeded board, Hill Climb gets a fixed terrain.
                Same setup for every player — pure skill leaderboard.
              </p>
              <div className="mono-snippet">
                <b>model</b> claude-sonnet-4-6
                <br />
                <b>cadence</b> <span className="y">every 24h</span>
              </div>
            </div>

            <div className="step">
              <div className="n">Feature 02</div>
              <div className="illus" style={{ fontSize: 28 }} aria-hidden>
                🤖
              </div>
              <h3>AI Coach</h3>
              <p>
                Post-run narration. References specific guesses, merges, or
                terrain events. Explains what you missed, scored against
                tournament percentile. Cached per stats-hash — zero-cost
                replay.
              </p>
              <div className="mono-snippet">
                <b>model</b> claude-haiku-4-5
                <br />
                <b>trigger</b> <span className="g">on game-over</span>
              </div>
            </div>

            <div className="step">
              <div className="n">Feature 03</div>
              <div className="illus" style={{ fontSize: 28 }} aria-hidden>
                🛡
              </div>
              <h3>Anti-cheat</h3>
              <p>
                Behavioural scoring of submissions. Flags input cadence,
                solver-tool signatures, impossible moves. On-chain scores
                that don&rsquo;t pass sit in a quarantine queue.
              </p>
              <div className="mono-snippet">
                <b>status</b> <span className="y">coming soon</span>
                <br />
                <b>gate</b> pre-submit oracle
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================== CTA BAND =================== */}
      <section className="wrap" style={{ paddingBottom: 40 }}>
        <div className="cta-band">
          <div>
            <h2>
              Twenty games. One pool.
              <br />
              Bring your skill.
            </h2>
            <p>Live now on Base Sepolia. Mainnet once the invariants hold.</p>
          </div>
          <div style={{ display: "flex", gap: 12, zIndex: 1 }}>
            <a href="#games" className="btn btn-primary btn-lg">
              Start playing <span className="arrow">→</span>
            </a>
            <a href="#" className="btn btn-ghost btn-lg">
              Read docs
            </a>
          </div>
        </div>
      </section>

      {/* =================== FOOTER =================== */}
      <footer className="site">
        <div className="wrap">
          <div className="grid">
            <div className="col">
              <img
                src="/assets/sb-monogram.svg"
                alt="skillbase"
                width={64}
                style={{ marginBottom: 18 }}
              />
              <p className="tagline">
                Skill market on Base. Classic arcade games, real-money
                tournaments, on-chain scores.
              </p>
              <div className="socials" aria-label="social links">
                <a
                  className="soc"
                  href="#"
                  aria-label="Farcaster"
                  title="Farcaster"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 3h16v2h-2v14h3v2h-7v-2h2v-6h-8v6h2v2H3v-2h3V5H4V3z"
                      fill="currentColor"
                    />
                  </svg>
                </a>
                <a className="soc" href="#" aria-label="X / Twitter" title="X">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.2-6.8L5.2 22H2l7.6-8.7L2 2h6.7l4.7 6.2L18.9 2zm-1.1 18h1.8L7.4 4H5.5l12.3 16z" />
                  </svg>
                </a>
                <a className="soc" href="#" aria-label="GitHub" title="GitHub">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.1-1.47-1.1-1.47-.9-.62.07-.6.07-.6 1 .07 1.52 1.02 1.52 1.02.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.26-.45-1.28.1-2.66 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.66.64.7 1.03 1.59 1.03 2.68 0 3.84-2.35 4.69-4.58 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
                  </svg>
                </a>
                <a
                  className="soc"
                  href="#"
                  aria-label="Warpcast"
                  title="Warpcast"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M4 4h16v16H4z" />
                    <path d="M8 8l2 8 2-5 2 5 2-8" />
                  </svg>
                </a>
                <a
                  className="soc"
                  href="#"
                  aria-label="Discord"
                  title="Discord"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M19.5 5.2A16.4 16.4 0 0 0 15.4 4l-.2.4a14 14 0 0 0-4.4 0L10.6 4a16.4 16.4 0 0 0-4.1 1.2A17 17 0 0 0 3.2 15.6a15.6 15.6 0 0 0 4.6 2.3l.9-1.3a10.3 10.3 0 0 1-1.5-.7l.4-.3a11 11 0 0 0 9.8 0l.4.3a10 10 0 0 1-1.5.7l.9 1.3a15.6 15.6 0 0 0 4.6-2.3 17 17 0 0 0-3.3-10.4zM9.4 13.4c-.9 0-1.7-.8-1.7-1.9s.8-1.9 1.7-1.9 1.7.9 1.7 1.9-.7 1.9-1.7 1.9zm5.2 0c-1 0-1.7-.8-1.7-1.9s.8-1.9 1.7-1.9 1.7.9 1.7 1.9-.7 1.9-1.7 1.9z" />
                  </svg>
                </a>
              </div>
            </div>

            <div className="col">
              <h4>Arcade</h4>
              <ul>
                <li>
                  <a href="https://2048.skillbase.games">2048</a>
                </li>
                <li>
                  <a href="https://wordle.skillbase.games">Wordle</a>
                </li>
                <li>
                  <a href="https://snake.skillbase.games">Snake</a>
                </li>
                <li>
                  <a href="https://minesweeper.skillbase.games">Minesweeper</a>
                </li>
                <li>
                  <a href="#games">All 20 →</a>
                </li>
              </ul>
            </div>

            <div className="col">
              <h4>Product</h4>
              <ul>
                <li><a href="#">Tournaments</a></li>
                <li><a href="#">Leaderboards</a></li>
                <li><a href="#">Pool rules</a></li>
                <li><a href="#">Roadmap</a></li>
              </ul>
            </div>

            <div className="col">
              <h4>Developers</h4>
              <ul>
                <li>
                  <a href="#">
                    Docs <span className="arrow">↗</span>
                  </a>
                </li>
                <li>
                  <a href="#">
                    ArcadePool.sol <span className="arrow">↗</span>
                  </a>
                </li>
                <li>
                  <a href="#">
                    Basescan <span className="arrow">↗</span>
                  </a>
                </li>
                <li>
                  <a href="https://github.com/">
                    GitHub <span className="arrow">↗</span>
                  </a>
                </li>
                <li><a href="#">Submit a game</a></li>
              </ul>
            </div>
          </div>

          <div className="legal">
            <span>© 2026 skillbase · built on Base</span>
            <span className="chain">
              ArcadePool · 0x8e4a…42c1 · chainId 84532
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
