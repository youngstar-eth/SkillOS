// Session token cache at ~/.skillos/session.json.
//
// Persists the SIWB bearer JWT (and optionally a SIWA receipt) so that
// short-lived CLI invocations don't re-prompt for a wallet signature on
// every write. Keyed by env + chainId + wallet address so a single user
// can hold sessions for both testnet and mainnet simultaneously.
//
// Sensitive payload — file perms 0600. Tokens are not secrets per se
// (server-signed JWTs, 24h TTL, revocable by nonce reuse) but get the
// same treatment as the private key file out of caution.

import fs from 'node:fs';
import path from 'node:path';
import type { Address } from 'viem';
import { CONFIG_DIR } from './config.js';

export interface BearerSession {
  kind: 'bearer';
  token: string;
  expiresAt: number; // unix ms
  address: Address;
  env: 'testnet' | 'mainnet';
  chainId: number;
}

export interface AgentReceiptSession {
  kind: 'receipt';
  receipt: string;
  expiresAt: number; // unix ms
  address: Address;
  agentId: number;
  env: 'testnet' | 'mainnet';
  chainId: number;
  builderCode?: string;
}

export type SessionEntry = BearerSession | AgentReceiptSession;

interface SessionFile {
  sessions: SessionEntry[];
}

const SESSION_PATH = path.join(CONFIG_DIR, 'session.json');

function readFile(): SessionFile {
  try {
    const raw = fs.readFileSync(SESSION_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SessionFile>;
    return { sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] };
  } catch {
    return { sessions: [] };
  }
}

function writeFile(file: SessionFile): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(SESSION_PATH, JSON.stringify(file, null, 2), { mode: 0o600 });
}

function isLive(entry: SessionEntry, now: number): boolean {
  return entry.expiresAt > now;
}

export function findBearer(
  env: 'testnet' | 'mainnet',
  address: Address,
  now = Date.now(),
): BearerSession | null {
  const file = readFile();
  const match = file.sessions.find(
    (s): s is BearerSession =>
      s.kind === 'bearer' &&
      s.env === env &&
      s.address.toLowerCase() === address.toLowerCase() &&
      isLive(s, now),
  );
  return match ?? null;
}

export function findAgentReceipt(
  env: 'testnet' | 'mainnet',
  agentId: number,
  now = Date.now(),
): AgentReceiptSession | null {
  const file = readFile();
  const match = file.sessions.find(
    (s): s is AgentReceiptSession =>
      s.kind === 'receipt' && s.env === env && s.agentId === agentId && isLive(s, now),
  );
  return match ?? null;
}

export function saveSession(entry: SessionEntry): void {
  const file = readFile();
  const now = Date.now();

  // Drop expired + the matching prior entry (one active session per env/wallet
  // or env/agent pair). Avoids unbounded file growth across re-logins.
  const filtered = file.sessions.filter((s) => {
    if (!isLive(s, now)) return false;
    if (s.kind !== entry.kind) return true;
    if (s.env !== entry.env) return true;
    if (s.kind === 'bearer' && entry.kind === 'bearer') {
      return s.address.toLowerCase() !== entry.address.toLowerCase();
    }
    if (s.kind === 'receipt' && entry.kind === 'receipt') {
      return s.agentId !== entry.agentId;
    }
    return true;
  });

  writeFile({ sessions: [...filtered, entry] });
}

export function clearSessions(): void {
  writeFile({ sessions: [] });
}
