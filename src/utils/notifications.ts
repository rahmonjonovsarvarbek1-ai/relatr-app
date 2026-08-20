// src/utils/notifications.ts
//
// Local (on-device) scheduled notifications for friends' important dates
// (birthdays, anniversaries, etc). This is the core of the app, so keep it
// simple and predictable:
//
//   - Every ImportantDate gets up to two scheduled notifications:
//       1. "on the day"      — fires every year on date.month/date.day
//       2. "N days before"   — fires every year N days earlier (default 3)
//   - Both use expo-notifications' native `yearly` trigger, so once
//     scheduled they keep firing every year with no re-scheduling needed.
//   - Identifiers are deterministic (`relatr-date-<dateId>-onday` /
//     `-before`), so callers can cancel/replace a date's notifications
//     without having to track any extra state.
//
// All functions are no-ops (and never throw) when running on web or in
// an environment where expo-notifications isn't available, so this file
// is always safe to import from cross-platform code.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Friend, ImportantDate } from '../types';

const REMINDER_DAYS_BEFORE = 3;
const NOTIFICATION_HOUR = 9; // 9:00 local time
const NOTIFICATION_MINUTE = 0;

let handlerConfigured = false;

/** Tells the OS how to present a notification while the app is foregrounded. */
export function configureNotificationHandler() {
  if (handlerConfigured || Platform.OS === 'web') return;
  handlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('important-dates', {
      name: 'Important dates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    }).catch(() => {});
  }
}

/** Requests OS notification permission. Safe to call multiple times. */
export async function requestNotificationPermissionsAsync(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    configureNotificationHandler();
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return !!requested.granted;
  } catch (e) {
    console.error('requestNotificationPermissionsAsync error:', e);
    return false;
  }
}

export async function hasNotificationPermissionAsync(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const res = await Notifications.getPermissionsAsync();
    return !!res.granted;
  } catch {
    return false;
  }
}

function onDayIdentifier(dateId: string) {
  return `relatr-date-${dateId}-onday`;
}

function beforeIdentifier(dateId: string) {
  return `relatr-date-${dateId}-before`;
}

/** Shifts a month/day pair back by `days`, correctly rolling over year/month
 * boundaries (Dec 31 - 3 days -> Dec 28, Jan 1 - 3 days -> Dec 29, etc). We
 * anchor to a fixed leap year so Feb 29 birthdays don't throw off the math. */
function shiftMonthDay(month0: number, day: number, daysBack: number) {
  const anchor = new Date(2024, month0, day, 12, 0, 0);
  anchor.setDate(anchor.getDate() - daysBack);
  return { month0: anchor.getMonth(), day: anchor.getDate() };
}

function dateLabel(date: ImportantDate): string {
  return date.label?.trim() || date.type;
}

/** Schedules (or re-schedules) the "on the day" and "N days before"
 * notifications for a single important date. Any previously-scheduled
 * notifications for this date are cancelled first, so this is safe to call
 * repeatedly (e.g. after every edit). */
export async function scheduleImportantDateNotifications(
  friend: Pick<Friend, 'id' | 'name'>,
  date: ImportantDate
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    configureNotificationHandler();
    await cancelImportantDateNotifications(date.id);

    if (!(await hasNotificationPermissionAsync())) return;

    const d = new Date(date.date);
    if (Number.isNaN(d.getTime())) return;
    const month0 = d.getMonth();
    const day = d.getDate();
    const label = dateLabel(date);

    await Notifications.scheduleNotificationAsync({
      identifier: onDayIdentifier(date.id),
      content: {
        title: `🎉 ${label} today!`,
        body: `Today is ${friend.name}'s ${label.toLowerCase()}.`,
        data: { friendId: friend.id, dateId: date.id, kind: 'onday' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.YEARLY,
        month: month0,
        day,
        hour: NOTIFICATION_HOUR,
        minute: NOTIFICATION_MINUTE,
      },
    });

    const before = shiftMonthDay(month0, day, REMINDER_DAYS_BEFORE);
    await Notifications.scheduleNotificationAsync({
      identifier: beforeIdentifier(date.id),
      content: {
        title: `📅 Coming up: ${label}`,
        body: `${friend.name}'s ${label.toLowerCase()} is in ${REMINDER_DAYS_BEFORE} days.`,
        data: { friendId: friend.id, dateId: date.id, kind: 'before' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.YEARLY,
        month: before.month0,
        day: before.day,
        hour: NOTIFICATION_HOUR,
        minute: NOTIFICATION_MINUTE,
      },
    });
  } catch (e) {
    console.error('scheduleImportantDateNotifications error:', e);
  }
}

/** Cancels both notifications (on-day + reminder) for one important date. */
export async function cancelImportantDateNotifications(dateId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Promise.all([
      Notifications.cancelScheduledNotificationAsync(onDayIdentifier(dateId)).catch(() => {}),
      Notifications.cancelScheduledNotificationAsync(beforeIdentifier(dateId)).catch(() => {}),
    ]);
  } catch (e) {
    console.error('cancelImportantDateNotifications error:', e);
  }
}

/** Schedules notifications for every important date belonging to a friend. */
export async function scheduleAllForFriend(friend: Friend): Promise<void> {
  if (Platform.OS === 'web') return;
  for (const date of friend.importantDates) {
    await scheduleImportantDateNotifications(friend, date);
  }
}

/** Cancels notifications for every important date belonging to a friend
 * (used when the friend itself is deleted). */
export async function cancelAllForFriend(friend: Pick<Friend, 'importantDates'>): Promise<void> {
  if (Platform.OS === 'web') return;
  for (const date of friend.importantDates) {
    await cancelImportantDateNotifications(date.id);
  }
}

/** Cancels every scheduled Relatr notification (used when push is turned off). */
export async function cancelAllScheduledNotificationsAsync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.error('cancelAllScheduledNotificationsAsync error:', e);
  }
}

/** Full resync: cancels everything, then re-schedules every friend's
 * important dates. Used on app start and when push notifications are
 * toggled back on. Archived friends are skipped. */
export async function rescheduleAllNotifications(friends: Friend[]): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await cancelAllScheduledNotificationsAsync();
    if (!(await hasNotificationPermissionAsync())) return;
    for (const friend of friends) {
      if (friend.isArchived) continue;
      await scheduleAllForFriend(friend);
    }
  } catch (e) {
    console.error('rescheduleAllNotifications error:', e);
  }
}
