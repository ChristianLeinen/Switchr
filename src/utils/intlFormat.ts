export function formatLocaleNumber(
  value: number,
  locale?: string,
  options?: Intl.NumberFormatOptions
): string {
  try {
    return new Intl.NumberFormat(locale || undefined, options).format(value);
  } catch {
    return String(value);
  }
}

export function formatLocaleDateTime(
  value: string | number | Date | null | undefined,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!value) return '-';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';

  try {
    return new Intl.DateTimeFormat(locale || undefined, options ?? {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(parsed);
  } catch {
    return parsed.toLocaleString();
  }
}
