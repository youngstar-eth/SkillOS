// Opaque base64url cursor. Internally stores either:
//   - { kind: 'block', block: string, logIndex: number }   — for log-derived feeds
//   - { kind: 'index', i: number }                          — for in-memory slices
//
// Opacity matters: clients must not parse it. If we change the encoding later,
// existing cursors are invalidated server-side, never client-side.

export type Cursor =
  | { kind: 'block'; block: string; logIndex: number }
  | { kind: 'index'; i: number };

const encode = (obj: Cursor): string =>
  Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');

const decode = (s: string): Cursor | null => {
  try {
    const parsed = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    if (parsed.kind === 'block' && typeof parsed.block === 'string' && typeof parsed.logIndex === 'number') {
      return parsed;
    }
    if (parsed.kind === 'index' && typeof parsed.i === 'number') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

export const encodeBlockCursor = (block: bigint, logIndex: number): string =>
  encode({ kind: 'block', block: block.toString(), logIndex });

export const encodeIndexCursor = (i: number): string =>
  encode({ kind: 'index', i });

export const decodeBlockCursor = (s: string | undefined): { block: bigint; logIndex: number } | null => {
  if (!s) return null;
  const c = decode(s);
  if (!c || c.kind !== 'block') return null;
  return { block: BigInt(c.block), logIndex: c.logIndex };
};

export const decodeIndexCursor = (s: string | undefined): number | null => {
  if (!s) return null;
  const c = decode(s);
  if (!c || c.kind !== 'index') return null;
  return c.i;
};
