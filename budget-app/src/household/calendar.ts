import { tr, intlLocale, locale } from "../i18n";
export type DateMode = "date" | "month";
export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export const localToday = () => new Date().toLocaleDateString("sv-SE");

export function parseCalendarValue(
  value: string,
  mode: DateMode,
): string | null {
  const input = value.trim();
  let year: number,
    month: number,
    day = 1;
  if (mode === "month") {
    const iso = /^(\d{4})-(\d{2})$/.exec(input);
    const local =
      /^(\d{1,2})[./](\d{4})$/.exec(input) || /^(\d{2})(\d{4})$/.exec(input);
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
    } else if (local) {
      year = Number(local[2]);
      month = Number(local[1]);
    } else return null;
  } else {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    const local =
      /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(input) ||
      /^(\d{2})(\d{2})(\d{4})$/.exec(input);
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      day = Number(iso[3]);
    } else if (local) {
      year = Number(local[3]);
      month = Number(local[2]);
      day = Number(local[1]);
    } else return null;
  }
  if (
    year < 1000 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return null;
  return isoDay(date).slice(0, mode === "month" ? 7 : 10);
}

export function displayCalendarValue(value: string, mode: DateMode): string {
  const parsed = parseCalendarValue(value, mode);
  if (!parsed) return "";
  const [year, month, day] = parsed.split("-");
  const separator = locale.value === "pl" ? "." : "/";
  return mode === "month"
    ? `${month}${separator}${year}`
    : `${day}${separator}${month}${separator}${year}`;
}

export const calendarMonthLabel = (value: string) =>
  new Intl.DateTimeFormat(intlLocale(), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`));
export const calendarDayLabel = (value: string) =>
  parseCalendarValue(value, "date")
    ? new Intl.DateTimeFormat(intlLocale(), {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`))
    : tr("Poza zakresem");

export function shiftCalendarMonth(value: string, amount: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const last = new Date(Date.UTC(year!, month! + amount, 0)).getUTCDate();
  return isoDay(
    new Date(Date.UTC(year!, month! - 1 + amount, Math.min(day || 1, last))),
  );
}
