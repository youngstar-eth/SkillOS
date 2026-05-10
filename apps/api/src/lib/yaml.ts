// Minimal YAML serializer for OpenAPI documents.
//
// Why not pull in `yaml` or `js-yaml`: this serializer only needs to handle
// JSON-compatible data (the OpenAPI document is one), and a tiny dependency-free
// implementation keeps the function bundle slim and avoids surface area we
// don't need (custom tags, anchors, etc.).
//
// Behavior:
//   - Strings are double-quoted with JSON escaping (always safe, never ambiguous).
//   - Numbers, booleans, null serialize as plain scalars.
//   - Arrays use block sequence (`- item`).
//   - Objects use block mapping (`key: value`).
//   - Empty arrays/objects render inline as `[]` / `{}`.

const indent = (n: number) => '  '.repeat(n);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const writeScalar = (v: unknown): string => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  return JSON.stringify(v);
};

const writeNode = (v: unknown, depth: number): string => {
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return v
      .map((item) => {
        if (Array.isArray(item) || isPlainObject(item)) {
          const inner = writeNode(item, depth + 1);
          // Block-style nested: dash on its own line.
          return `${indent(depth)}-\n${inner}`;
        }
        return `${indent(depth)}- ${writeScalar(item)}`;
      })
      .join('\n');
  }
  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    if (keys.length === 0) return '{}';
    return keys
      .map((k) => {
        const child = v[k];
        const keyText = `${indent(depth)}${JSON.stringify(k).slice(1, -1)}:`;
        if (Array.isArray(child)) {
          if (child.length === 0) return `${keyText} []`;
          return `${keyText}\n${writeNode(child, depth + 1)}`;
        }
        if (isPlainObject(child)) {
          if (Object.keys(child).length === 0) return `${keyText} {}`;
          return `${keyText}\n${writeNode(child, depth + 1)}`;
        }
        return `${keyText} ${writeScalar(child)}`;
      })
      .join('\n');
  }
  return `${indent(depth)}${writeScalar(v)}`;
};

export const stringify = (doc: unknown): string => `${writeNode(doc, 0)}\n`;
