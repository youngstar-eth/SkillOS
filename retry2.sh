#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd /Users/inancayvaz/2048

LOG=/Users/inancayvaz/2048/retry2_log.txt
: > "$LOG"

run_scan() {
  local url="$1"
  local name="$2"
  rm -rf "./designs/$name"
  echo "[START] $name ($url)" >> "$LOG"
  if skillui --url "$url" --mode ultra --out "./designs/$name" --name "$name" >> "$LOG" 2>&1; then
    echo "[OK] $name" >> "$LOG"
  else
    echo "[FAIL] $name" >> "$LOG"
  fi
}

run_scan "https://vercel.com" "breakout" &
run_scan "https://warbyparker.com" "bubble" &
wait

run_scan "https://dribbble.com" "helix" &
run_scan "https://github.com" "pong" &
wait

echo "[ALL DONE]" >> "$LOG"
