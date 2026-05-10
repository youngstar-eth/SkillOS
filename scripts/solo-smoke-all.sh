#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Gate 4 harness — runs scripts/solo-smoke.sh against all 6 Phase-1
# subdomains in parallel, then emits a single pass/fail matrix aggregating
# per-app per-assertion results.
#
# Exit codes:
#   0  — every assertion passed on every subdomain
#   1  — one or more assertions failed somewhere
#   2  — a smoke run aborted early
#
# Per-subdomain logs are retained at /tmp/solo-smoke/<slug>.log.
#
# Bash 3.2-compatible (macOS default) — matrix rendering delegates to
# python3 which handles the associative-array lookups cleanly.
# ─────────────────────────────────────────────────────────────────────────────

set -u

SUBDOMAINS=(2048 wordle sudoku minesweeper clicker match3)
LOG_DIR="/tmp/solo-smoke"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE="$SCRIPT_DIR/solo-smoke.sh"

mkdir -p "$LOG_DIR"

echo "── dispatching smoke to ${#SUBDOMAINS[@]} subdomains in parallel ──"

for slug in "${SUBDOMAINS[@]}"; do
  (
    BASE_URL="https://${slug}.skillos.games" "$SMOKE" \
      > "$LOG_DIR/${slug}.log" 2>&1
    echo $? > "$LOG_DIR/${slug}.exit"
  ) &
done
wait

echo "── all smoke runs complete — rendering matrix ──"
echo

# ─── delegate matrix rendering to python3 ───────────────────────────────────

SUBDOMAIN_LIST="${SUBDOMAINS[*]}" LOG_DIR="$LOG_DIR" python3 - <<'PY'
import os
import re
import sys
from pathlib import Path

GREEN = "\033[32m"
RED = "\033[31m"
DIM = "\033[2m"
RESET = "\033[0m"
ANSI = re.compile(r"\x1b\[[0-9;]*m")

subdomains = os.environ["SUBDOMAIN_LIST"].split()
log_dir = Path(os.environ["LOG_DIR"])

# status[(slug, name)] = "PASS" | "FAIL"
status = {}
# assertion_order preserves the sequential order the smoke script emits; we
# take it from 2048's log because that's the reference.
assertion_order = []
seen = set()

for slug in subdomains:
    log_path = log_dir / f"{slug}.log"
    if not log_path.exists():
        continue
    for line in log_path.read_text().splitlines():
        clean = ANSI.sub("", line)
        parts = clean.split(None, 2)
        if len(parts) < 2:
            continue
        st, name = parts[0], parts[1]
        if st not in ("PASS", "FAIL"):
            continue
        status[(slug, name)] = st
        if slug == "2048" and name not in seen:
            seen.add(name)
            assertion_order.append(name)

# Fallback if 2048's log is missing: union of names from every app in
# first-seen order.
if not assertion_order:
    for slug in subdomains:
        for (s, n), _ in status.items():
            if s == slug and n not in seen:
                seen.add(n)
                assertion_order.append(n)

# Column widths
name_col = max([len("assertion")] + [len(n) for n in assertion_order]) + 2
sub_col = max(12, max(len(s) for s in subdomains) + 2)

def pad(s, w):
    return s + " " * (w - len(s))

def rule(w):
    return "─" * w

# Header
header = "  " + pad("assertion", name_col)
for s in subdomains:
    header += "  " + pad(s, sub_col)
print(header)

rule_line = "  " + rule(name_col)
for _ in subdomains:
    rule_line += "  " + rule(sub_col)
print(rule_line)

any_fail = False
for name in assertion_order:
    row = "  " + pad(name, name_col)
    for s in subdomains:
        st = status.get((s, name))
        if st == "PASS":
            cell = f"{GREEN}{pad('PASS', sub_col)}{RESET}"
        elif st == "FAIL":
            cell = f"{RED}{pad('FAIL', sub_col)}{RESET}"
            any_fail = True
        else:
            cell = f"{DIM}{pad('—', sub_col)}{RESET}"
        row += "  " + cell
    print(row)

print(rule_line)

# TOTAL row — per subdomain: passed/total, or ABORT if exit code 2
totals_row = "  " + pad("TOTAL", name_col)
aborts = 0
for s in subdomains:
    exit_path = log_dir / f"{s}.exit"
    code = exit_path.read_text().strip() if exit_path.exists() else "?"
    p = sum(1 for n in assertion_order if status.get((s, n)) == "PASS")
    f = sum(1 for n in assertion_order if status.get((s, n)) == "FAIL")
    if code == "2":
        aborts += 1
        label = "ABORT"
        color = RED
    elif code == "0" and f == 0:
        label = f"{p}/{p}"
        color = GREEN
    else:
        label = f"{p}/{p+f}"
        color = RED
    totals_row += "  " + f"{color}{pad(label, sub_col)}{RESET}"
print(totals_row)
print()

# Aggregate
total_cells = len(assertion_order) * len(subdomains)
passed = sum(1 for v in status.values() if v == "PASS")
failed = sum(1 for v in status.values() if v == "FAIL")

print("── Gate 4 summary ──")
print(f"  subdomains:       {len(subdomains)}")
print(f"  assertions/app:   {len(assertion_order)}")
print(f"  total cells:      {total_cells}")
print(f"  passed:           {passed}")
print(f"  failed:           {failed}")
print(f"  aborts:           {aborts}")
print(f"  logs:             {log_dir}/<slug>.log")
print()

if aborts > 0:
    sys.exit(2)
if any_fail:
    sys.exit(1)
sys.exit(0)
PY

exit $?
