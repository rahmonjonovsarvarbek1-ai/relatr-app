import type { WorldSpecialDay } from '../types';

export const COUNTRY_OPTIONS: { code: string; label: string }[] = [
  { code: 'GLOBAL', label: 'Global' },
  { code: 'UZ', label: 'Uzbekistan' },
  { code: 'US', label: 'USA' },
  { code: 'GB', label: 'UK' },
  { code: 'RU', label: 'Russia' },
  { code: 'TR', label: 'Turkey' },
];

export const countryLabel = (code?: string | null): string =>
  COUNTRY_OPTIONS.find((c) => c.code === (code ?? 'GLOBAL'))?.label ?? code ?? 'Global';

export const CATEGORY_OPTIONS: { key: string; label: string }[] = [
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

/** Params passed to the SpecialDayDetail screen. */
export interface SpecialDayParams {
  dayId: string;
  name: string;
  localName?: string | null;
  icon?: string | null;
  category?: string | null;
  month: number;
  day: number;
  isoDate: string;
  countryCode: string;
  countryLabel: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

function startOfToday(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

/** Whole days from today until an ISO date (YYYY-MM-DD); negative if past. */
export function daysUntilDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - startOfToday().getTime()) / DAY_MS);
}

/**
 * The sync keeps each row on the holiday's next occurrence, so `year` is
 * normally already correct. If a row is stale (its date just passed and the
 * next sync has not run yet) we roll it forward a year instead of showing a
 * negative countdown.
 */
export function withNextDate(w: WorldSpecialDay): UpcomingSpecialDay {
  const today = startOfToday();
  let year = w.year ?? today.getFullYear();
  let date = new Date(year, w.month - 1, w.day);
  while (date < today) {
    year += 1;
    date = new Date(year, w.month - 1, w.day);
  }
  const isoDate = `${year}-${pad(w.month)}-${pad(w.day)}`;
  return { ...w, days: Math.round((date.getTime() - today.getTime()) / DAY_MS), isoDate };
}

/**
 * The "Global" view lists holidays of every country, so the same day
 * (e.g. Christmas Day) would repeat once per country. Keep the first one.
 */
export function dedupeSpecialDays<T extends WorldSpecialDay>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((w) => {
    const key = `${w.name.toLowerCase()}|${w.month}|${w.day}`;
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