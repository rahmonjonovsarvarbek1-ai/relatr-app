// =====================================================================
// Edge Function: google-calendar-sync
// =====================================================================
// Vazifasi: Google Calendar'ning ochiq "Holidays in <country>" kalendaridan
// bayramlarni olib, public.world_holidays jadvaliga yozadi.
//
// Deploy:
//   supabase functions deploy google-calendar-sync
//   supabase secrets set GOOGLE_API_KEY=xxxxx
// =====================================================================

import { createClient } from '@supabase/supabase-js';

// Global Deno tiplari VS Code'da xato bermasligi uchun
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') ?? '';

// CORS Sarlavhalari (Frontend'dan to'g'ridan-to'g mehmonga chaqirish imkoni uchun)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Google-ning ochiq (public) bayramlar kalendarlari — mamlakat kodiga mos.
const HOLIDAY_CALENDARS: Record<string, string> = {
  UZ: 'en.uzbekistan#holiday@group.v.calendar.google.com',
  US: 'en.usa#holiday@group.v.calendar.google.com',
  RU: 'en.russian#holiday@group.v.calendar.google.com',
  GB: 'en.uk#holiday@group.v.calendar.google.com',
  TR: 'en.turkish#holiday@group.v.calendar.google.com',
};

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { date?: string; dateTime?: string };
  htmlLink?: string;
}

function emojiForHoliday(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('new year')) return '🎆';
  if (n.includes('valentine')) return '💘';
  if (n.includes('women')) return '💐';
  if (n.includes('navro') || n.includes('nowruz')) return '🌱';
  if (n.includes('independence')) return '🎉';
  if (n.includes('christmas')) return '🎄';
  if (n.includes('teacher')) return '🍎';
  if (n.includes('victory')) return '🎖️';
  if (n.includes('labour') || n.includes('labor')) return '🛠️';
  return '📅';
}

async function fetchHolidaysForCountry(countryCode: string, calendarId: string) {
  const timeMin = new Date();
  timeMin.setMonth(timeMin.getMonth() - 1); // o'tgan oydan
  const timeMax = new Date();
  timeMax.setFullYear(timeMax.getFullYear() + 1); // keyingi yilgacha

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  );
  url.searchParams.set('key', GOOGLE_API_KEY);
  url.searchParams.set('timeMin', timeMin.toISOString());
  url.searchParams.set('timeMax', timeMax.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '250');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API xatosi (${countryCode}): ${res.status} ${text}`);
  }
  const data = await res.json();
  const items: GoogleCalendarEvent[] = data.items ?? [];

  return items
    .filter((e) => e.start?.date) // faqat kun-darajasidagi (all-day) bayramlar
    .map((e) => ({
      google_event_id: e.id,
      country_code: countryCode,
      name: e.summary,
      description: e.description ?? null,
      emoji: emojiForHoliday(e.summary),
      event_date: e.start.date,
      is_recurring_yearly: true,
      source: 'google_calendar',
      html_link: e.htmlLink ?? null,
    }));
}

Deno.serve(async (req: Request) => {
  // CORS Preflight so'rovlarini qaytarish
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!GOOGLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_API_KEY environment o'zgaruvchisi sozlanmagan" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // So'rov query orqali bitta davlat berilishi mumkin: ?country=UZ
    const url = new URL(req.url);
    const requestedCountry = url.searchParams.get('country')?.toUpperCase();

    let countriesToSync: Record<string, string> = {};

    if (requestedCountry) {
      if (!HOLIDAY_CALENDARS[requestedCountry]) {
        return new Response(
          JSON.stringify({ error: `'${requestedCountry}' kodi uchun kalendar topilmadi.` }),
          { status: 400, headers: corsHeaders }
        );
      }
      countriesToSync = { [requestedCountry]: HOLIDAY_CALENDARS[requestedCountry] };
    } else {
      countriesToSync = HOLIDAY_CALENDARS;
    }

    let totalUpserted = 0;
    const errors: string[] = [];

    for (const [countryCode, calendarId] of Object.entries(countriesToSync)) {
      if (!calendarId) continue;
      try {
        const holidays = await fetchHolidaysForCountry(countryCode, calendarId);
        if (holidays.length === 0) continue;

        const { error } = await supabase
          .from('world_holidays')
          .upsert(holidays, { onConflict: 'country_code,google_event_id' });

        if (error) {
          errors.push(`${countryCode}: ${error.message}`);
        } else {
          totalUpserted += holidays.length;
        }
      } catch (err) {
        errors.push(`${countryCode}: ${(err as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        upserted: totalUpserted,
        errors,
        syncedAt: new Date().toISOString(),
      }),
      { status: errors.length === 0 ? 200 : 207, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: corsHeaders }
    );
  }
});