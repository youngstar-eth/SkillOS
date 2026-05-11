// Output helpers — JSON-first with optional column rendering for human eyes.
//
// All informational output goes to stdout; diagnostics/warnings go to
// stderr. This keeps `skillos foo | jq` clean — pipelines see only the
// data.

import type { Address } from 'viem';

export function printJSON(value: unknown): void {
  process.stdout.write(JSON.stringify(value, replacer, 2) + '\n');
}

export function info(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`! ${message}\n`);
}

export function fail(message: string, exitCode = 1): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(exitCode);
}

// JSON.stringify of bigint throws; coerce to decimal string instead.
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

interface Column<T> {
  header: string;
  format: (row: T) => string;
  width?: number;
}

export function renderTable<T>(rows: T[], columns: Column<T>[]): string {
  if (rows.length === 0) return '(empty)';
  const cells = rows.map((row) => columns.map((c) => c.format(row)));
  const widths = columns.map((c, i) =>
    Math.max(c.width ?? 0, c.header.length, ...cells.map((row) => row[i]!.length)),
  );
  const sep = widths.map((w) => '─'.repeat(w)).join('─┼─');
  const header = columns.map((c, i) => c.header.padEnd(widths[i]!)).join(' │ ');
  const body = cells
    .map((row) => row.map((cell, i) => cell.padEnd(widths[i]!)).join(' │ '))
    .join('\n');
  return `${header}\n${sep}\n${body}`;
}

export function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortHash(hash: string, head = 10, tail = 8): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
