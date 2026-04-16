#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd /Users/inancayvaz/2048

LOG=/Users/inancayvaz/2048/scan_log.txt
: > "$LOG"

run_scan() {
  local url="$1"
  local name="$2"
  echo "[START] $name ($url)" >> "$LOG"
  if skillui --url "$url" --mode ultra --out "./designs/$name" --name "$name" >> "$LOG" 2>&1; then
    echo "[OK] $name" >> "$LOG"
  else
    echo "[FAIL] $name" >> "$LOG"
  fi
}

# Run in parallel batches of 3 (wordle already done)
run_scan "https://bauhaus100.de" "2048" &
run_scan "https://poolsuite.net" "snake" &
run_scan "https://webdesignmuseum.org/exhibitions/y2k-aesthetic-in-web-design" "minesweeper" &
wait

run_scan "https://muji.com" "sudoku" &
run_scan "https://newretrowave.com" "pong" &
run_scan "https://forestapp.cc" "clicker" &
wait

run_scan "https://neopets.com" "match3" &
run_scan "https://synthwave.es" "breakout" &
run_scan "https://glossier.com" "bubble" &
wait

run_scan "https://darkakademia.com" "solitaire" &
run_scan "https://glitch.com" "geodash" &
run_scan "https://lexaloffle.com/pico-8.php" "crossy" &
wait

run_scan "https://cyberpunk.net" "jetpack" &
run_scan "https://memphis-milano.com" "helix" &
run_scan "https://nirvana.com" "stickman" &
wait

run_scan "https://dark.design" "hillclimb" &
run_scan "https://johnniewalker.com" "pool" &
run_scan "https://airship.com" "tower" &
wait

run_scan "https://dreams.fandom.com" "flappy" &
wait

echo "[ALL DONE]" >> "$LOG"
