/** Key-sorted JSON serialization so fingerprints are order-stable. */

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    Object.keys(record)
      .sort()
      .forEach(key => {
        sorted[key] = sortKeysDeep(record[key]);
      });
    return sorted;
  }

  return value;
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}
