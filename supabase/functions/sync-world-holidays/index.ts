// =====================================================================
// Edge Function: sync-world-holidays  (v3)
// =====================================================================
// Pulls public holidays from the free Nager.Date API (no API key) and
// upserts them into public.world_holidays, together with a small curated
// list of worldwide observances.
//
// One STABLE row per holiday (external_id = "<COUNTRY>-<name-slug>").
// Every sync moves the row to the holiday's NEXT occurrence, so ids never
// change and user reminders / cached details stay attached.
//
// v3 fixes vs v2
//   * A country whose request failed for ANY year is no longer upserted.
//     Before, if 2026 failed but 2027 succeeded, the row jumped to the 2027
//     date and the remaining 2026 occurrence was silently skipped.
//   * 1-day grace on "today": the server runs in UTC, users do not. A
//     holiday that is still "today" for a user in the Americas used to be
//     rolled to next year as soon as UTC passed midnight.
//   * Fetch retries only on network errors / timeouts / 429 / 5xx, with a
//     short backoff (a 404 for an unsupported country is not retried).
//   * Cooldown no longer swallows requests with a custom `year`/`countries`
//     (they are still protected by the force rate limit).
//   * Icon rule `king` is word-anchored (no accidental matches).
//
// Request body (all optional):
//   { year?: number, force?: boolean, countries?: string[] }
//
// Deploy:  supabase functions deploy sync-world-holidays
// Needs:   world_holidays_v2.sql applied first, with a UNIQUE constraint on
//          world_holidays (country_code, external_id) — the upsert relies on it.
// Imports: "@supabase/supabase-js" must be mapped in supabase/functions/deno.json
//          (e.g. "npm:@supabase/supabase-js@2"), otherwise the bare import fails in Deno.
// =====================================================================

import { createClient } from '@supabase/supabase-js';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const SYNC_COOLDOWN_HOURS = 20;
const FORCE_MIN_INTERVAL_MINUTES = 10;
const FETCH_TIMEOUT_MS = 8000;
const FETCH_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;
const MAX_COUNTRIES = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

// Full list of Nager.Date country codes: https://date.nager.at/Country
const DEFAULT_COUNTRIES = ['UZ', 'US', 'GB', 'RU', 'TR'];

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------
// Icons + categories (Ionicons names; the app falls back to a calendar
// icon if a name is ever missing from its glyph map).
// ---------------------------------------------------------------------

type Category = 'national' | 'religious' | 'international' | 'seasonal' | 'observance';

interface Style {
  icon: string;
  category: Category;
}

// First match wins, so order matters.
const STYLE_RULES: { test: RegExp; style: Style }[] = [
  { test: /\b(eid|ramadan|ramazan|kurban|hayit|fitr|adha|mawlid)\b/i, style: { icon: 'moon-outline', category: 'religious' } },
  { test: /christmas|nativity/i, style: { icon: 'gift-outline', category: 'religious' } },
  {
    test: /easter|good friday|palm sunday|pentecost|\bwhit\b|ascension|epiphany|assumption|all saints|orthodox|\bholy\b|corpus/i,
    style: { icon: 'sparkles-outline', category: 'religious' },
  },
  { test: /new year/i, style: { icon: 'balloon-outline', category: 'international' } },
  { test: /navruz|nowruz|novruz|\bspring\b/i, style: { icon: 'flower-outline', category: 'seasonal' } },
  { test: /women/i, style: { icon: 'woman-outline', category: 'international' } },
  { test: /labou?r|may day|workers/i, style: { icon: 'briefcase-outline', category: 'international' } },
  {
    test: /victory|memorial|remembrance|veteran|defen[cs]e|armed forces|martyr/i,
    style: { icon: 'ribbon-outline', category: 'national' },
  },
  {
    test: /independence|freedom|republic|constitution|sovereignty|\bnational\b|\bflag\b|\bunity\b|democracy|juneteenth/i,
    style: { icon: 'flag-outline', category: 'national' },
  },
  { test: /teacher|education|school|knowledge|youth|student/i, style: { icon: 'school-outline', category: 'observance' } },
  { test: /thanksgiving/i, style: { icon: 'restaurant-outline', category: 'seasonal' } },
  { test: /halloween/i, style: { icon: 'skull-outline', category: 'seasonal' } },
  { test: /valentine/i, style: { icon: 'heart-outline', category: 'international' } },
  { test: /mother|father|parent|family|children|child/i, style: { icon: 'people-outline', category: 'observance' } },
  { test: /\bking\b|queen|president|columbus|washington|lincoln|luther/i, style: { icon: 'star-outline', category: 'national' } },
];

const DEFAULT_STYLE: Style = { icon: 'calendar-outline', category: 'national' };

const styleFor = (name: string): Style =>
  STYLE_RULES.find((r) => r.test.test(name))?.style ?? DEFAULT_STYLE;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ---------------------------------------------------------------------
// Curated worldwide observances (fixed dates only). Holidays that Nager
// already returns for a country are deliberately NOT repeated here.
// ---------------------------------------------------------------------

interface Curated extends Style {
  month: number;
  day: number;
  name: string;
}

const CURATED: Curated[] = [
  { month: 2, day: 14, name: "Valentine's Day", icon: 'heart-outline', category: 'international' },
  { month: 3, day: 20, name: 'International Day of Happiness', icon: 'happy-outline', category: 'international' },
  { month: 4, day: 7, name: 'World Health Day', icon: 'medkit-outline', category: 'international' },
  { month: 4, day: 22, name: 'Earth Day', icon: 'leaf-outline', category: 'international' },
  { month: 5, day: 15, name: 'International Day of Families', icon: 'people-outline', category: 'international' },
  { month: 6, day: 5, name: 'World Environment Day', icon: 'earth-outline', category: 'international' },
  { month: 7, day: 30, name: 'International Day of Friendship', icon: 'people-circle-outline', category: 'international' },
  { month: 8, day: 12, name: 'International Youth Day', icon: 'rocket-outline', category: 'international' },
  { month: 9, day: 21, name: 'International Day of Peace', icon: 'globe-outline', category: 'international' },
  { month: 10, day: 5, name: "World Teachers' Day", icon: 'school-outline', category: 'international' },
  { month: 10, day: 31, name: 'Halloween', icon: 'skull-outline', category: 'seasonal' },
  { month: 11, day: 13, name: 'World Kindness Day', icon: 'heart-circle-outline', category: 'international' },
  { month: 11, day: 19, name: "International Men's Day", icon: 'man-outline', category: 'international' },
  { month: 11, day: 20, name: "Universal Children's Day", icon: 'happy-outline', category: 'international' },
  { month: 12, day: 10, name: 'Human Rights Day', icon: 'hand-left-outline', category: 'international' },
  { month: 12, day: 31, name: "New Year's Eve", icon: 'balloon-outline', category: 'international' },
];

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

interface NagerHoliday {
  date: string; // "2026-01-01"
  localName: string;
  name: string;
  countryCode: string;
  fixed?: boolean;
  global: boolean; // true = nationwide (NOT "worldwide")
  counties?: string[] | null;
  types?: string[];
}

interface WorldHolidayRow {
  external_id: string;
  name: string;
  local_name: string | null;
  emoji: string; // legacy column, no longer used by the app
  icon: string;
  category: Category;
  is_fixed: boolean | null;
  types: string[] | null;
  month: number;
  day: number;
  year: number;
  country_code: string;
  source: 'nager' | 'curated';
  updated_at: string;
}

// ---------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

const isRetryable = (e: unknown) =>
  !(e instanceof HttpError) || e.status === 429 || e.status >= 500;

async function fetchJson<T>(url: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS * attempt);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.status === 204) return [] as unknown as T;
      if (!res.ok) throw new HttpError(res.status);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) break; // e.g. 404 for an unsupported country
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startedAt = new Date();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
    }

    const raw = await req.json().catch(() => ({}));
    const body: { year?: unknown; force?: unknown; countries?: unknown } =
      raw && typeof raw === 'object' ? raw : {};

    // A `year` equal to the current one is the same as the default, not a custom request.
    const yearGiven = body.year !== undefined && body.year !== startedAt.getUTCFullYear();
    const baseYear =
      typeof body.year === 'number' && Number.isInteger(body.year) && body.year > 2000 && body.year < 2100
        ? body.year
        : startedAt.getUTCFullYear();
    const force = body.force === true;

    let countries = DEFAULT_COUNTRIES;
    const countriesGiven = body.countries !== undefined;
    if (countriesGiven) {
      const list = body.countries;
      const valid =
        Array.isArray(list) &&
        list.length > 0 &&
        list.length <= MAX_COUNTRIES &&
        list.every((c: unknown) => typeof c === 'string' && /^[A-Z]{2}$/.test(c));
      if (!valid) {
        return json({ error: `countries must be 1-${MAX_COUNTRIES} uppercase ISO-2 codes` }, 400);
      }
      countries = Array.from(new Set<string>(list as string[]));
    }
    const years = [baseYear, baseYear + 1];
    const customRequest = yearGiven || countriesGiven;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ---- Cooldown / rate limit (a failing log table never blocks a sync) ----
    try {
      const [{ data: lastOk }, { data: lastAny }] = await Promise.all([
        supabase
          .from('world_holiday_sync_log')
          .select('finished_at')
          .eq('status', 'success')
          .order('finished_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('world_holiday_sync_log')
          .select('finished_at')
          .order('finished_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // The cooldown only applies to the default scheduled sync.
      if (!force && !customRequest && lastOk?.finished_at) {
        const hours = (Date.now() - new Date(lastOk.finished_at).getTime()) / 3_600_000;
        if (hours < SYNC_COOLDOWN_HOURS) return json({ skipped: true, reason: 'cooldown', hoursSince: hours });
      }
      if ((force || customRequest) && lastAny?.finished_at) {
        const minutes = (Date.now() - new Date(lastAny.finished_at).getTime()) / 60_000;
        if (minutes < FORCE_MIN_INTERVAL_MINUTES) {
          return json({ skipped: true, reason: 'force_rate_limited', minutesSince: minutes });
        }
      }
    } catch (e) {
      console.error('cooldown check failed, syncing anyway:', (e as Error).message);
    }

    // ---- Fetch every (country, year) in parallel ----
    const errors: string[] = [];
    const failedCountries = new Set<string>();
    const jobs = countries.flatMap((country) => years.map((year) => ({ country, year })));

    const results = await Promise.all(
      jobs.map(async ({ country, year }) => {
        try {
          const holidays = await fetchJson<NagerHoliday[]>(
            `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`,
          );
          return { country, holidays };
        } catch (e) {
          errors.push(`${country} ${year}: ${(e as Error).message}`);
          failedCountries.add(country);
          return { country, holidays: [] as NagerHoliday[] };
        }
      }),
    );

    // ---- Keep, per holiday, only the next occurrence on/after today ----
    // `cutoff` is yesterday (UTC): users west of UTC may still be on "today".
    // The app rolls any genuinely stale row forward on its own.
    const cutoffIso = isoDate(new Date(startedAt.getTime() - DAY_MS));
    const nowIso = startedAt.toISOString();
    const best = new Map<string, { row: WorldHolidayRow; date: string }>();

    for (const { country, holidays } of results) {
      // A partial fetch would skip an occurrence and jump to the next year: keep old rows instead.
      if (failedCountries.has(country)) continue;

      for (const h of holidays) {
        // Skip regional (county-level) holidays; keep nationwide public ones.
        if (!h.global) continue;
        if (h.types && !h.types.some((t) => t === 'Public' || t === 'Observance')) continue;
        if (h.date < cutoffIso) continue;

        const [year, month, day] = h.date.split('-').map(Number);
        if (![year, month, day].every(Number.isFinite)) continue;

        const slug = slugify(h.name);
        if (!slug) continue;
        const key = `${country}-${slug}`;
        const prev = best.get(key);
        if (prev && prev.date <= h.date) continue;

        const style = styleFor(h.name);
        best.set(key, {
          date: h.date,
          row: {
            external_id: key,
            name: h.name,
            local_name: h.localName && h.localName !== h.name ? h.localName : null,
            emoji: '',
            icon: style.icon,
            category: style.category,
            is_fixed: h.fixed ?? null,
            types: h.types ?? null,
            month,
            day,
            year,
            country_code: country,
            source: 'nager',
            updated_at: nowIso,
          },
        });
      }
    }

    const rows: WorldHolidayRow[] = Array.from(best.values()).map((v) => v.row);

    // ---- Curated worldwide observances: next occurrence of a fixed date ----
    const thisYear = startedAt.getUTCFullYear();
    for (const c of CURATED) {
      const candidate = `${thisYear}-${pad(c.month)}-${pad(c.day)}`;
      const year = candidate >= cutoffIso ? thisYear : thisYear + 1;
      rows.push({
        external_id: `GLOBAL-${slugify(c.name)}`,
        name: c.name,
        local_name: null,
        emoji: '',
        icon: c.icon,
        category: c.category,
        is_fixed: true,
        types: ['Observance'],
        month: c.month,
        day: c.day,
        year,
        country_code: 'GLOBAL',
        source: 'curated',
        updated_at: nowIso,
      });
    }

    // ---- Upsert ----
    let upsertError: string | null = null;
    if (rows.length > 0) {
      const { error } = await supabase
        .from('world_holidays')
        .upsert(rows, { onConflict: 'country_code,external_id' });
      if (error) upsertError = error.message;
    }

    const status = upsertError ? 'failed' : errors.length === 0 ? 'success' : 'partial';

    // ---- Log the run (best effort) ----
    const { error: logError } = await supabase.from('world_holiday_sync_log').insert({
      started_at: nowIso,
      finished_at: new Date().toISOString(),
      status,
      countries,
      years,
      synced: upsertError ? 0 : rows.length,
      errors: upsertError ? [...errors, upsertError] : errors,
      triggered_by: force ? 'manual' : 'auto',
    });
    if (logError) console.error('sync log insert failed:', logError.message);

    if (upsertError) return json({ error: upsertError, partialErrors: errors }, 500);

    return json(
      {
        success: status === 'success',
        status,
        synced: rows.length,
        years,
        countries,
        skippedCountries: Array.from(failedCountries),
        errors,
        syncedAt: nowIso,
      },
      status === 'success' ? 200 : 207,
    );
  } catch (err) {
    console.error('sync-world-holidays error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});