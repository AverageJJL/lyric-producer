export type ArrangementValidationError = {
  path: string;
  message: string;
};

export type JsonRecord = Record<string, unknown>;

export function record(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function add(
  errors: ArrangementValidationError[],
  path: string,
  message: string,
): null {
  errors.push({path, message});
  return null;
}

export function exactKeys(
  value: JsonRecord,
  path: string,
  keys: string[],
  errors: ArrangementValidationError[],
): void {
  const allowed = new Set(keys);
  Object.keys(value).forEach(key => {
    if (!allowed.has(key)) {
      add(errors, `${path}.${key}`, 'Unexpected field.');
    }
  });
}

export function stringField(
  value: JsonRecord,
  key: string,
  path: string,
  errors: ArrangementValidationError[],
): string | null {
  const raw = value[key];
  return typeof raw === 'string' && raw.trim().length > 0
    ? raw
    : add(errors, `${path}.${key}`, 'Expected a non-empty string.');
}

export function optionalString(value: JsonRecord, key: string): string | undefined {
  return typeof value[key] === 'string' && value[key].trim().length > 0
    ? value[key] as string
    : undefined;
}

export function numberField(
  value: JsonRecord,
  key: string,
  path: string,
  errors: ArrangementValidationError[],
  min = Number.NEGATIVE_INFINITY,
): number | null {
  const raw = value[key];
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= min
    ? raw
    : add(errors, `${path}.${key}`, `Expected a finite number >= ${min}.`);
}

export function booleanField(
  value: JsonRecord,
  key: string,
  path: string,
  errors: ArrangementValidationError[],
): boolean | null {
  return typeof value[key] === 'boolean'
    ? value[key] as boolean
    : add(errors, `${path}.${key}`, 'Expected a boolean.');
}

export function oneOf<T extends string>(
  value: JsonRecord,
  key: string,
  allowed: Set<T>,
  path: string,
  errors: ArrangementValidationError[],
): T | null {
  const raw = value[key];
  return typeof raw === 'string' && allowed.has(raw as T)
    ? raw as T
    : add(errors, `${path}.${key}`, 'Expected a supported value.');
}
