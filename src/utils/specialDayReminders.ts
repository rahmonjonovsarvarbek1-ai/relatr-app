import { supabase } from './supabase';

const TABLE = 'special_day_reminders';
const UNIQUE_VIOLATION = '23505';

/** All holiday ids the user has a reminder for, or null if the request failed. */
export async function fetchReminderIds(userId: string): Promise<Set<string> | null> {
  const { data, error } = await supabase.from(TABLE).select('holiday_id').eq('user_id', userId);
  if (error) {
    console.error('load reminders error:', error);
    return null;
  }
  return new Set((data ?? []).map((r: { holiday_id: string }) => String(r.holiday_id)));
}

/** Turns a reminder on/off. Returns true on success (a duplicate insert counts as success). */
export async function setSpecialDayReminder(
  userId: string,
  holidayId: string,
  enabled: boolean,
  remindDaysBefore = 1,
): Promise<boolean> {
  const { error } = enabled
    ? await supabase
        .from(TABLE)
        .insert({ holiday_id: holidayId, user_id: userId, remind_days_before: remindDaysBefore })
    : await supabase.from(TABLE).delete().eq('holiday_id', holidayId).eq('user_id', userId);

  if (error && !(enabled && error.code === UNIQUE_VIOLATION)) {
    console.error('toggle reminder error:', error);
    return false;
  }
  return true;
}