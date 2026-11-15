/** Keyed lookup typed as possibly missing (ids can be stale at runtime). */
export function lookup<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): T | undefined {
  return record[key]
}

/** Widens a value the types call non-null but that may be absent at runtime. */
export function maybe<T>(value: T): T | undefined {
  return value
}
