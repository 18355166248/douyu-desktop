const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
const BEIJING_OFFSET_HOURS = 8;
const MIN_YEAR = 2000;

/**
 * Douyu and Bilibili both stamp live times as `YYYY-MM-DD HH:mm:ss` in Beijing
 * time (UTC+8) regardless of the viewer's time zone. Parsing them with
 * `new Date(text)` would silently apply the machine zone, so the offset is
 * applied explicitly.
 */
export function parseBeijingDateTime(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const match = DATE_TIME.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  if (!year || !month || !day || !hour || !minute || !second) return null;

  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = Number(second);
  if (yearNumber < MIN_YEAR) return null;
  if (monthNumber < 1 || monthNumber > 12) return null;
  if (dayNumber < 1 || dayNumber > 31) return null;
  if (hourNumber > 23 || minuteNumber > 59 || secondNumber > 59) return null;

  // The wall-clock values are Beijing time, so shift them back before asking
  // `Date.UTC` for the epoch. Out-of-range days (for example 31 February) roll
  // into the next month here, which is rejected below by a round-trip check.
  const epoch = Date.UTC(
    yearNumber,
    monthNumber - 1,
    dayNumber,
    hourNumber - BEIJING_OFFSET_HOURS,
    minuteNumber,
    secondNumber,
  );
  if (!Number.isFinite(epoch)) return null;

  const roundTrip = new Date(epoch + BEIJING_OFFSET_HOURS * 60 * 60 * 1000);
  if (roundTrip.getUTCFullYear() !== yearNumber || roundTrip.getUTCMonth() !== monthNumber - 1) {
    return null;
  }
  if (roundTrip.getUTCDate() !== dayNumber) return null;

  return epoch;
}

/** Formats an epoch millisecond value back into the platform's Beijing time. */
export function formatBeijingDateTime(epochMs: number): string {
  const shifted = new Date(epochMs + BEIJING_OFFSET_HOURS * 60 * 60 * 1000);
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  return [
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`,
  ].join(' ');
}
