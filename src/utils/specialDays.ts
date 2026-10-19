import type { WorldSpecialDay } from '../types';

export const COUNTRY_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'GLOBAL', label: 'Global' },
  { code: 'UZ', label: 'Uzbekistan' },
  { code: 'US', label: 'USA' },
  { code: 'GB', label: 'UK' },
  { code: 'RU', label: 'Russia' },
  { code: 'TR', label: 'Turkey' },
];

export const countryLabel = (code?: string | null): string =>
  COUNTRY_OPTIONS.find((c) => c.code === (code ?? 'GLOBAL'))?.label ?? code ?? 'Global';

export const CATEGORY_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'ALL', label: 'All types' },
  { key: 'national', label: 'National' },
  { key: 'religious', label: 'Religious' },
  { key: 'international', label: 'International' },
  { key: 'seasonal', label: 'Seasonal' },
  { key: 'observance', label: 'Observances' },
];

export const categoryLabel = (key?: string | null): string =>
  CATEGORY_OPTIONS.find((c) => c.key === key)?.label ?? 'Holiday';

export interface UpcomingSpecialDay extends WorldSpecialDay {
  days: number; // days until the next occurrence (0 = today)
  isoDate: string; // next occurrence as YYYY-MM-DD
}

/** Params passed to the SpecialDayDetail screen (may come from deep links, so be lenient). */
export interface SpecialDayParams {
  dayId: string;
  name: string;
  localName?: string | null;
  icon?: string | null;
  category?: string | null;
  month?: number | null;
  day?: number | null;
  isoDate?: string | null;
  countryCode?: string;
  countryLabel?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LOOKAHEAD_YEARS = 8; // enough to reach the next Feb 29
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

export function startOfToday(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

/** Parses a strict YYYY-MM-DD string into a local Date, or null if it is not a real calendar date. */
export function parseIsoDate(value?: string | null): Date | null {
  const m = value ? ISO_DATE_RE.exec(value) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/** Returns the value only if it is a real calendar date, otherwise null (e.g. "2026-NaN-NaN"). */
export const validIsoDate = (value?: string | null): string | null =>
  parseIsoDate(value) ? (value as string) : null;

/** Whole days from today until an ISO date; negative if past; null if the date is invalid. */
export function daysUntilDate(iso: string): number | null {
  const date = parseIsoDate(iso);
  return date ? Math.round((date.getTime() - startOfToday().getTime()) / DAY_MS) : null;
}

/**
 * Computes the next occurrence of a holiday. Rows with an invalid month/day return null.
 * A stale row (its date has passed and the next sync has not run yet) is rolled forward,
 * and Feb 29 correctly jumps to the next leap year instead of silently becoming Mar 1.
 */
export function nextOccurrence(
  w: WorldSpecialDay,
  today: Date = startOfToday(),
): UpcomingSpecialDay | null {
  const { month, day } = w;
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const firstYear = Math.max(w.year ?? today.getFullYear(), today.getFullYear());
  for (let year = firstYear; year <= firstYear + MAX_LOOKAHEAD_YEARS; year += 1) {
    const date = new Date(year, month - 1, day);
    if (date.getMonth() !== month - 1) continue; // day does not exist that year
    if (date < today) continue;
    return {
      ...w,
      days: Math.round((date.getTime() - today.getTime()) / DAY_MS),
      isoDate: `${year}-${pad(month)}-${pad(day)}`,
    };
  }
  return null;
}


/**
 * @deprecated Kept only so older callers like `list.map(withNextDate)` keep working: it takes
 * exactly ONE argument (so `.map` can't pass the index as `today`) and never returns null.
 * A row with an invalid date sorts last. New code should use `buildUpcoming` / `nextOccurrence`.
 */
export function withNextDate(w: WorldSpecialDay): UpcomingSpecialDay {
  return nextOccurrence(w) ?? { ...w, days: Number.MAX_SAFE_INTEGER, isoDate: '' };
}

/** Maps rows to upcoming days (dropping invalid ones) sorted by how soon they occur. */
export function buildUpcoming(
  list: WorldSpecialDay[],
  today: Date = startOfToday(),
): UpcomingSpecialDay[] {
  const result: UpcomingSpecialDay[] = [];
  for (const w of list) {
    const u = nextOccurrence(w, today);
    if (u) result.push(u);
  }
  return result.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

/** Case-insensitive match on the English and the local name. `query` must already be lower-cased. */
export const matchesSearch = (w: WorldSpecialDay, query: string): boolean =>
  !query ||
  w.name.toLowerCase().includes(query) ||
  !!w.localName?.toLowerCase().includes(query);

/**
 * The "Global" view lists holidays of every country, so the same day
 * (e.g. Christmas Day) would repeat once per country. Keep the first one.
 */
export function dedupeSpecialDays<T extends WorldSpecialDay>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((w) => {
    const key = `${w.name.trim().toLowerCase()}|${w.month}|${w.day}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toDetailParams(d: UpcomingSpecialDay): SpecialDayParams {
  return {
    dayId: String(d.id),
    name: d.name,
    localName: d.localName ?? null,
    icon: d.icon ?? null,
    category: d.category ?? null,
    month: d.month,
    day: d.day,
    isoDate: d.isoDate,
    countryCode: d.countryCode ?? 'GLOBAL',
    countryLabel: countryLabel(d.countryCode),
  };
}