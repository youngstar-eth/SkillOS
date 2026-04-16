#!/usr/bin/env python3
import json, os, sys

GAMES = {
    "wordle": "https://linear.app",
    "2048": "https://bauhaus100.de",
    "snake": "https://poolsuite.net",
    "minesweeper": "https://cameronsworld.net (alt)",
    "sudoku": "https://stripe.com (alt)",
    "pong": "https://github.com (alt)",
    "clicker": "https://forestapp.cc",
    "match3": "https://neopets.com",
    "breakout": "https://vercel.com (alt)",
    "bubble": "https://warbyparker.com (alt)",
    "solitaire": "https://darkakademia.com",
    "geodash": "https://glitch.com",
    "crossy": "https://lexaloffle.com/pico-8.php",
    "jetpack": "https://cyberpunk.net",
    "helix": "https://dribbble.com (alt)",
    "stickman": "https://nirvana.com",
    "hillclimb": "https://dark.design",
    "pool": "https://johnniewalker.com",
    "tower": "https://airship.com",
    "flappy": "https://dreams.fandom.com",
}

base = "/Users/inancayvaz/2048/designs"
print(f"{'GAME':<14}{'URL':<42}{'PRIMARY':<11}{'ACCENT':<11}{'BG':<11}{'FONT':<22}")
print("-" * 110)

success, fail = [], []
for name, url in GAMES.items():
    tdir = os.path.join(base, name, f"{name}-design", "tokens")
    cpath = os.path.join(tdir, "colors.json")
    tpath = os.path.join(tdir, "typography.json")
    if not (os.path.exists(cpath) and os.path.exists(tpath)):
        fail.append(name)
        print(f"{name:<14}{url:<42}MISSING")
        continue
    success.append(name)
    with open(cpath) as f:
        colors = json.load(f)
    with open(tpath) as f:
        typo = json.load(f)
    core = colors.get("core", {})
    accent = core.get("accent", {}).get("value") or "—"
    text_primary = core.get("text-primary", {}).get("value") or "—"
    bg = core.get("background", {}).get("value") or "—"
    families = typo.get("families", [])
    font = families[0] if families else "—"
    # fallback font from scale
    if font == "—":
        scale = typo.get("scale", {})
        for v in scale.values():
            ff = v.get("fontFamily")
            if ff:
                font = ff.split(",")[0].strip().strip('"')
                break
    print(f"{name:<14}{url:<42}{text_primary:<11}{accent:<11}{bg:<11}{font:<22}")

print()
print(f"Başarılı: {len(success)}/20")
print(f"Hatalı  : {len(fail)} {fail}")
