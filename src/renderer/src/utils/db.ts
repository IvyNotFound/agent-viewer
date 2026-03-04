// sql.js returns Uint8Array for TEXT columns in some cases — convert to string
export function toStr(v: unknown): unknown {
  if (v instanceof Uint8Array) return new TextDecoder().decode(v)
  return v
}

export function normalizeRow<T extends Record<string, unknown>>(row: T): T {
  const out = {} as T
  for (const k in row) out[k] = toStr(row[k]) as T[typeof k]
  return out
}
