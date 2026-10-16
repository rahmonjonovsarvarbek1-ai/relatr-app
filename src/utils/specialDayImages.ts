import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Ro'yxatdagi har bir kun uchun birinchi rasmni (Wikipedia) topadi.
 *  1) Keshdan (world_special_day_details) bitta so'rov bilan hammasini o'qiydi.
 *  2) Keshda yo'q kunlar uchun Edge Function'ni fonda, bir vaqtda 2 tadan chaqiradi.
 *  Natija ilova ishlab turguncha xotirada saqlanadi.
 */

type Resolved = string | null;

const MAX_CONCURRENT = 2;
const LOOKUP_DELAY_MS = 40;

const resolved = new Map<string, Resolved>();
const requested = new Set<string>();
const waiters = new Map<string, Array<(url: Resolved) => void>>();
const pendingLookup = new Map<string, string>(); // id -> name
const fetchQueue: Array<{ id: string; name: string }> = [];
let lookupTimer: ReturnType<typeof setTimeout> | null = null;
let active = 0;

function settle(id: string, url: Resolved) {
  resolved.set(id, url);
  const callbacks = waiters.get(id);
  waiters.delete(id);
  callbacks?.forEach((cb) => cb(url));
}

function pump() {
  while (active < MAX_CONCURRENT && fetchQueue.length > 0) {
    const job = fetchQueue.shift()!;
    active += 1;
    supabase.functions
      .invoke('fetch-special-day-details', { body: { holidayId: job.id, name: job.name } })
      .then(({ data, error }) => {
        const details = (data as { details?: { image_urls?: string[] | null } } | null)?.details;
        settle(job.id, error ? null : details?.image_urls?.[0] ?? null);
      })
      .catch(() => settle(job.id, null))
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

async function flushLookups() {
  lookupTimer = null;
  const batch = Array.from(pendingLookup.entries());
  pendingLookup.clear();
  if (batch.length === 0) return;

  const { data, error } = await supabase
    .from('world_special_day_details')
    .select('holiday_id, image_urls')
    .in('holiday_id', batch.map(([id]) => id));
  if (error) console.error('special day image cache error:', error);

  const found = new Map<string, Resolved>();
  (data ?? []).forEach((r: { holiday_id: string; image_urls: string[] | null }) => {
    found.set(String(r.holiday_id), r.image_urls?.[0] ?? null);
  });

  for (const [id, name] of batch) {
    if (found.has(id)) settle(id, found.get(id) ?? null);
    else fetchQueue.push({ id, name });
  }
  pump();
}

/** Kun uchun birinchi rasm URL'i; hali yuklanmagan yoki topilmasa null. */
export function useSpecialDayImage(id: string, name: string): string | null {
  const [url, setUrl] = useState<Resolved | undefined>(() => resolved.get(id));

  useEffect(() => {
    if (resolved.has(id)) {
      setUrl(resolved.get(id));
      return;
    }
    setUrl(undefined);

    let alive = true;
    const callback = (u: Resolved) => {
      if (alive) setUrl(u);
    };
    waiters.set(id, [...(waiters.get(id) ?? []), callback]);

    if (!requested.has(id)) {
      requested.add(id);
      pendingLookup.set(id, name);
      if (!lookupTimer) lookupTimer = setTimeout(flushLookups, LOOKUP_DELAY_MS);
    }

    return () => {
      alive = false;
    };
  }, [id, name]);

  return url ?? null;
}