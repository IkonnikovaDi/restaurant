export function asTrimmedString(value: unknown, maxLength = 255): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }

  return trimmed;
}

export function asPositiveInt(
  value: unknown,
  min = 1,
  max = Number.MAX_SAFE_INTEGER
): number | null {
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

export function asDateTime(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function asDateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  return value;
}

export function isPhone(value: string): boolean {
  return /^[0-9+() -]{10,20}$/.test(value);
}
