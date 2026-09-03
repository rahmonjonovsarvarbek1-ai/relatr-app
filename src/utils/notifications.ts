// src/utils/notifications.ts
//
// Local (on-device) scheduled notifications for friends' important dates
// (birthdays, anniversaries, etc).

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Friend, ImportantDate } from '../types';

const REMINDER_DAYS_BEFORE = 3;
const NOTIFICATION_HOUR = 9; // 9:00 local time
const NOTIFICATION_MINUTE = 0;

// Expo Go (SDK 53+) check
const isExpoGo = Constants.appOwnership === 'expo';
const isUnsupportedEnv = Platform.OS === 'web' || isExpoGo;

let Notifications: typeof import('expo-notifications') | null = null;
if (!isUnsupportedEnv) {
  try {
    Notifications = require('expo-notifications');
  } catch (e) {
    console.error('expo-notifications module failed to load:', e);
    Notifications = null;
  }
}

let handlerConfigured = false;

/** Tells the OS how to present a notification while the app is foregrounded. */
export function configureNotificationHandler() {
  if (handlerConfigured || isUnsupportedEnv || !Notifications) return;
  handlerConfigured = true;

  try {
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
  } catch (e) {
    console.error('configureNotificationHandler error:', e);
  }
}

/** Requests OS notification permission. Safe to call multiple times. */
export async function requestNotificationPermissionsAsync(): Promise<boolean> {
  if (isUnsupportedEnv || !Notifications) return false;
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
  if (isUnsupportedEnv || !Notifications) return false;
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

/** Shifts a month/day pair back by `days`, returning 1-indexed month (1-12) for expo-notifications. */
function shiftMonthDay(month0: number, day: number, daysBack: number) {
  const anchor = new Date(2024, month0, day, 12, 0, 0);
  anchor.setDate(anchor.getDate() - daysBack);
  return { month: anchor.getMonth() + 1, day: anchor.getDate() };
}

function dateLabel(date: ImportantDate): string {
  return date.label?.trim() || date.type;
}

/** Schedules (or re-schedules) the "on the day" and "N days before" notifications for an important date. */
export async function scheduleImportantDateNotifications(
  friend: Pick<Friend, 'id' | 'name'>,
  date: ImportantDate
): Promise<void> {
  if (isUnsupportedEnv || !Notifications) return;
  try {
    configureNotificationHandler();
    await cancelImportantDateNotifications(date.id);

    if (!(await hasNotificationPermissionAsync())) return;

    const d = new Date(date.date);
    if (Number.isNaN(d.getTime())) return;

    const month0 = d.getMonth();
    const day = d.getDate();
    const label = dateLabel(date);

    // 1-indexed month for Expo Notifications (January = 1)
    const expoMonth = month0 + 1;

    await Notifications.scheduleNotificationAsync({
      identifier: onDayIdentifier(date.id),
      content: {
        title: `🎉 ${label} today!`,
        body: `Today is ${friend.name}'s ${label.toLowerCase()}.`,
        data: { friendId: friend.id, dateId: date.id, kind: 'onday' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.YEARLY,
        month: expoMonth,
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
        month: before.month,
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
  if (isUnsupportedEnv || !Notifications) return;
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
  if (isUnsupportedEnv || !Notifications) return;
  for (const date of friend.importantDates) {
    await scheduleImportantDateNotifications(friend, date);
  }
}

/** Cancels notifications for every important date belonging to a friend. */
export async function cancelAllForFriend(friend: Pick<Friend, 'importantDates'>): Promise<void> {
  if (isUnsupportedEnv || !Notifications) return;
  for (const date of friend.importantDates) {
    await cancelImportantDateNotifications(date.id);
  }
}

/** Cancels every scheduled Relatr notification. */
export async function cancelAllScheduledNotificationsAsync(): Promise<void> {
  if (isUnsupportedEnv || !Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.error('cancelAllScheduledNotificationsAsync error:', e);
  }
}

/** Full resync: cancels everything, then re-schedules every active friend's important dates. */
export async function rescheduleAllNotifications(friends: Friend[]): Promise<void> {
  if (isUnsupportedEnv || !Notifications) return;
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
