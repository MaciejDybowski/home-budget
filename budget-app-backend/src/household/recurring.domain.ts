import { dateOnly, normalize } from './domain';

export interface Schedule {
  anchorDate: Date;
  intervalMonths: number;
  status: string;
}

/** Offset from the original anchor, never from the preceding clamped date. */
export function occurrenceAt(anchor: Date, months: number): Date {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month, Math.min(anchor.getUTCDate(), lastDay)),
  );
}

export function scheduledDates(
  schedule: Schedule,
  from: Date,
  to: Date,
): Date[] {
  if (
    schedule.status !== 'ACTIVE' ||
    from > to ||
    !Number.isInteger(schedule.intervalMonths) ||
    schedule.intervalMonths < 1
  )
    return [];
  const monthDifference =
    (from.getUTCFullYear() - schedule.anchorDate.getUTCFullYear()) * 12 +
    from.getUTCMonth() -
    schedule.anchorDate.getUTCMonth();
  let offset =
    Math.max(0, Math.floor(monthDifference / schedule.intervalMonths)) *
    schedule.intervalMonths;
  const dates: Date[] = [];
  for (
    let index = 0;
    index < 2400;
    index++, offset += schedule.intervalMonths
  ) {
    const due = occurrenceAt(schedule.anchorDate, offset);
    if (due > to) break;
    if (due >= from) dates.push(due);
  }
  return dates;
}

export function validOccurrence(schedule: Schedule, due: Date): boolean {
  const months =
    (due.getUTCFullYear() - schedule.anchorDate.getUTCFullYear()) * 12 +
    due.getUTCMonth() -
    schedule.anchorDate.getUTCMonth();
  return (
    months >= 0 &&
    months % schedule.intervalMonths === 0 &&
    occurrenceAt(schedule.anchorDate, months).getTime() === due.getTime()
  );
}

export function patternMatches(
  charge: { name: string; matchPattern: string | null },
  expense: { merchant: string | null; description: string | null },
): boolean {
  const pattern = normalize(charge.matchPattern || charge.name);
  return (
    pattern.length >= 3 &&
    normalize(
      `${expense.merchant || ''} ${expense.description || ''}`,
    ).includes(pattern)
  );
}

export function monthBounds(month: string) {
  const from = dateOnly(`${month}-01`);
  const to = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0),
  );
  return { from, to };
}
