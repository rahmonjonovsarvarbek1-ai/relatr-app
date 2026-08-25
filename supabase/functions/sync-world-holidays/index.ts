// =====================================================================
// Edge Function: sync-world-holidays
// =====================================================================
// Purpose: Fetch public holidays from the free Nager.Date API
// (https://date.nager.at) — no API key or OAuth required — and upsert
// them into public.world_holidays.
//
// This is the ONLY holiday-sync function in this project. The previous
// Google Calendar-based sync has been removed because it used a
// different, incompatible row shape for the same table (google_event_id
// + event_date vs month/day/name/year) and required a paid/rate-limited
// API key. Consolidating onto Nager.Date avoids schema drift and removes
// the GOOGLE_API_KEY dependency entirely.
//
// Expected table shape (see accompanying migration):
//   world_holidays (
//     id           uuid primary key default gen_random_uuid(),
//     external_id  text not null,          -- stable per country+date+name
//     name         text not null,
//     emoji        text not null,
//     month        smallint not null,
//     day          smallint not null,
//     year         integer not null,
//     country_code text not null,          -- ISO code or 'GLOBAL'
//     source       text not null default 'nager',
//     updated_at   timestamptz not null default now(),
//     unique (country_code, external_id)
//   )
//
// Deploy:
//   supabase functions deploy sync-world-holidays
//
// Invoke (client, DatesScreen.tsx):
//   supabase.functions.invoke('sync-world-holidays', { body: { year: 2026 } })
//
// Safe to call on every screen focus: an internal cooldown skips the
// remote fetch if this year's data was refreshed within
// SYNC_COOLDOWN_HOURS, so repeated calls are cheap.
// =====================================================================

import { createClient } from '@supabase/supabase-js';





declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const SYNC_COOLDOWN_HOURS = 20;

// Full list of Nager.Date country codes: https://date.nager.at/Country
const COUNTRIES = ['UZ', 'US', 'GB', 'RU', 'TR'] as const;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const EMOJI_BY_KEYWORD: Record<string, string> = {
  christmas: '🎄',
  'new year': '🎆',
  independence: '🎉',
  labour: '👷',
  labor: '👷',
  women: '🌷',
  easter: '🐣',
  eid: '🌙',
  ramadan: '🌙',
  navruz: '🌸',
  nowruz: '🌸',
  victory: '🎖️',
  memorial: '🕊️',
  thanksgiving: '🦃',
  halloween: '🎃',
  valentine: '💝',
  teacher: '🍎',
};

function guessEmoji(name: string): string {
  const lower = name.toLowerCase();
  for (const [keyword, emoji] of Object.entries(EMOJI_BY_KEYWORD)) {
    if (lower.includes(keyword)) return emoji;
  }
  return '📅';
}

interface NagerHoliday {
  date: string; // "2026-01-01"
  localName: string;
  name: string;
  countryCode: string;
  global: boolean;
}

interface WorldHolidayRow {
  external_id: string;
  name: string;
  emoji: string;
  month: number;
  day: number;
  year: number;
  country_code: string;
  source: 'nager';
  updated_at: string;
}

async function fetchCountryHolidays(year: number, countryCode: string): Promise<NagerHoliday[]> {
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
  if (!res.ok) {
    console.error(`Nager fetch failed for ${countryCode} (${year}): ${res.status}`);
    return [];
  }
  return res.json();
}

function toRow(h: NagerHoliday, requestedCountry: string, nowIso: string): WorldHolidayRow | null {
  const parts = h.date.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [year, month, day] = parts;

  // A holiday flagged "global" by Nager still belongs to the country we
  // requested it under, but we tag it GLOBAL so the UI can show it under
  // every country filter without duplicating rows per country.
  const countryCode = h.global ? 'GLOBAL' : requestedCountry;
  const name = h.localName || h.name;

  return {
    // Stable across re-syncs regardless of name-string drift from the API.
    external_id: `${requestedCountry}-${h.date}`,
    name,
    emoji: guessEmoji(h.name),
    month,
    day,
    year,
    country_code: countryCode,
    source: 'nager',
    updated_at: nowIso,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured' }),
        { status: 500, headers: corsHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const year: number = Number.isFinite(body?.year) ? body.year : new Date().getFullYear();
    const force: boolean = body?.force === true;

    if (!force) {
      const { data: lastSyncRow, error: lastSyncError } = await supabase
        .from('world_holidays')
        .select('updated_at')
        .eq('source', 'nager')
        .eq('year', year)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSyncError) {
        // Don't fail the whole sync just because the cooldown check failed;
        // fall through and sync anyway.
        console.error('cooldown check error:', lastSyncError.message);
      }

      if (lastSyncRow?.updated_at) {
        const hoursSince = (Date.now() - new Date(lastSyncRow.updated_at).getTime()) / 3_600_000;
        if (hoursSince < SYNC_COOLDOWN_HOURS) {
          return new Response(
            JSON.stringify({ skipped: true, reason: 'cooldown', hoursSince, year }),
            { headers: corsHeaders },
          );
        }
      }
    }

    const nowIso = new Date().toISOString();
    const rowsByKey = new Map<string, WorldHolidayRow>();
    const errors: string[] = [];

    const results = await Promise.all(
      COUNTRIES.map(async (countryCode) => {
        try {
          const holidays = await fetchCountryHolidays(year, countryCode);
          return { countryCode, holidays };
        } catch (err) {
          errors.push(`${countryCode}: ${(err as Error).message}`);
          return { countryCode, holidays: [] as NagerHoliday[] };
        }
      }),
    );

    for (const { countryCode, holidays } of results) {
      for (const h of holidays) {
        const row = toRow(h, countryCode, nowIso);
        if (!row) continue;
        // De-dupe GLOBAL holidays reported by multiple countries in the
        // same sync pass (e.g. New Year's Day) so we don't upsert the
        // same conflict key twice in one batch.
        const key = `${row.country_code}::${row.external_id}`;
        rowsByKey.set(key, row);
      }
    }

    const rows = Array.from(rowsByKey.values());

    if (rows.length > 0) {
      const { error } = await supabase
        .from('world_holidays')
        .upsert(rows, { onConflict: 'country_code,external_id' });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message, partialErrors: errors }),
          { status: 500, headers: corsHeaders },
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        synced: rows.length,
        year,
        countries: COUNTRIES,
        errors,
        syncedAt: nowIso,
      }),
      { status: errors.length === 0 ? 200 : 207, headers: corsHeaders },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: corsHeaders },
    );
  }
});