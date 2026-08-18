export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const daysUntilNextOccurrence = (isoDate: string): number => {
  const target = new Date(isoDate);
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), target.getMonth(), target.getDate());
  thisYear.setHours(0, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let diff = Math.round((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) {
    const nextYear = new Date(now.getFullYear() + 1, target.getMonth(), target.getDate());
    diff = Math.round((nextYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }
  return diff;
};

export const formatRelativeDay = (days: number): string => {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `In ${days} days`;
  if (days <= 30) return `In ${Math.round(days / 7)} weeks`;
  return `In ${Math.round(days / 30)} months`;
};

export const formatShortDate = (isoDate: string): string => {
  const d = new Date(isoDate);
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
};

export const formatFullDate = (isoDate: string): string => {
  const d = new Date(isoDate);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

export const daysSince = (isoDate?: string): number | null => {
  if (!isoDate) return null;
  const then = new Date(isoDate);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
};

export const formatTimeAgo = (isoDate: string): string => {
  const d = daysSince(isoDate) ?? 0;
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
};

export const getAgeTurning = (isoDate: string): number | null => {
  const d = new Date(isoDate);
  if (!d.getFullYear() || d.getFullYear() < 1900) return null;
  const now = new Date();
  let nextBirthdayYear = now.getFullYear();
  const thisYearBday = new Date(nextBirthdayYear, d.getMonth(), d.getDate());
  if (thisYearBday.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
    nextBirthdayYear += 1;
  }
  return nextBirthdayYear - d.getFullYear();
};
