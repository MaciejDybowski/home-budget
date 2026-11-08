import { BadRequestException } from '@nestjs/common';
import Papa from 'papaparse';

export const kinds = [
  'EXPENSE',
  'REFUND',
  'TRANSFER',
  'LOAN_OVERPAYMENT',
] as const;
export type Kind = (typeof kinds)[number];

export function text(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`Nieprawidłowe pole: ${label}.`);
  }
  return value.trim();
}

export function money(value: unknown, allowZero = false): string {
  const normalized = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (
    !/^\d{1,10}(\.\d{1,2})?$/.test(normalized) ||
    (!allowZero && Number(normalized) <= 0)
  ) {
    throw new BadRequestException(
      'Kwota musi być dodatnia i mieć najwyżej dwa miejsca po przecinku.',
    );
  }
  return Number(normalized).toFixed(2);
}

export function dateOnly(value: unknown): Date {
  const input = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input))
    throw new BadRequestException('Nieprawidłowa data.');
  const date = new Date(`${input}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== input
  ) {
    throw new BadRequestException('Nieprawidłowa data.');
  }
  return date;
}

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function accountNumber(value: unknown): string | null {
  if (!value) return null;
  const number = String(value).replace(/[\s']/g, '').replace(/^PL/i, '');
  if (!/^\d{26}$/.test(number))
    throw new BadRequestException('Podaj 26 cyfr numeru rachunku.');
  // Polish NRB / IBAN checksum.
  const rearranged = `${number.slice(2)}2521${number.slice(0, 2)}`;
  let remainder = 0;
  for (const digit of rearranged)
    remainder = (remainder * 10 + Number(digit)) % 97;
  if (remainder !== 1)
    throw new BadRequestException('Nieprawidłowa suma kontrolna rachunku.');
  return number;
}

const aliases: Array<[RegExp, string]> = [
  [/\bjakdojade\.pl\b|\bcity-nav\b/, 'Jakdojade'],
  [/\bmediaexpert\.pl\b/, 'Media Expert'],
  [/\b(allegro\.pl|allegro)\b/, 'Allegro'],
  [/\bintercity\.pl\b/, 'PKP Intercity'],
  [/\bkoleo\.pl\b/, 'KOLEO'],
  [/\btauron\.pl\b/, 'Tauron'],
  [/\bcinema-city\.pl\b/, 'Cinema City'],
  [/\bmamabrum\.eu\b/, 'Mamabrum'],
  [/\bbookbowl\.pl\b/, 'Bookbowl'],
  [/\bdartshopper\.pl\b/, 'Dartshopper'],
  [/\boponeo\.pl\b/, 'Oponeo'],
  [/\bfabrykazapachu\.pl\b/, 'Fabryka Zapachu'],
  [/\baliexpress\.com\b/, 'AliExpress'],
  [/\bergohestia\.pl\b|\bergo hestia\b/, 'ERGO Hestia'],
  [/\beuro\.com\.pl\b|\brtv euro agd\b/, 'RTV EURO AGD'],
  [/\bbiedronka\b/, 'Biedronka'],
  [/\blidl\b/, 'Lidl'],
  [/\bpepco\b/, 'Pepco'],
  [/\borlen\b/, 'ORLEN'],
  [/\bmoya\b/, 'MOYA'],
  [/\bspotify\b/, 'Spotify'],
  [/\bapple\.com\/bill\b/, 'Apple'],
  [/\bopenai\b/, 'OpenAI'],
  [/\bt-mobile\b/, 'T-Mobile'],
  [/\brossmann\b/, 'Rossmann'],
  [/\bzabka\b/, 'Żabka'],
  [/\bauchan\b/, 'Auchan'],
  [/\bkaufland\b/, 'Kaufland'],
  [/\bcastorama\b/, 'Castorama'],
  [/\bikea\b/, 'IKEA'],
];

export function recognize(counterparty: string, title: string) {
  // Domain in title is more precise than the payment processor's name.
  const input = normalize(`${title} ${counterparty}`);
  const found = aliases.find(([pattern]) => pattern.test(input));
  return found
    ? {
        merchant: found[1],
        reason: 'Marka lub domena w danych bankowych',
        confidence: 'high',
      }
    : {
        merchant: counterparty.trim(),
        reason: 'Oryginalna nazwa odbiorcy — sprawdź',
        confidence: 'low',
      };
}

export interface BankRow {
  rawColumns: string[];
  externalId: string;
  date: string;
  bookingDate: string;
  amount: string;
  incoming: boolean;
  counterparty: string;
  title: string;
  counterpartyAccount: string;
  details: string;
  currency: string;
  originalAmount: string;
  originalCurrency: string;
}

export function parseIng(buffer: Buffer): BankRow[] {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    decoded = new TextDecoder('windows-1250', { fatal: true }).decode(buffer);
  }
  const lines = decoded.replace(/^\uFEFF/, '').split(/\r?\n/);
  const start = lines.findIndex((line) =>
    /^"?Data transakcji"?;/.test(line.trim()),
  );
  if (start < 0)
    throw new BadRequestException('Nie znaleziono nagłówka wyciągu ING.');
  const parsed = Papa.parse<string[]>(lines.slice(start).join('\n'), {
    delimiter: ';',
    skipEmptyLines: 'greedy',
  });
  if (parsed.errors.length)
    throw new BadRequestException(
      `Nieprawidłowy CSV: ${parsed.errors[0].message}`,
    );
  const [header, ...records] = parsed.data;
  if (
    header[1] !== 'Data księgowania' ||
    header[7] !== 'Nr transakcji' ||
    header[8] !== 'Kwota transakcji (waluta rachunku)' ||
    header.length !== 14
  ) {
    throw new BadRequestException('Nieobsługiwany układ kolumn ING.');
  }
  const csvDate = (value: string) => {
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim());
    if (!match) throw new BadRequestException(`Nieprawidłowa data: ${value}`);
    const iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    dateOnly(iso);
    return iso;
  };
  const result: BankRow[] = [];
  const ids = new Set<string>();
  for (const [index, record] of records.entries()) {
    const row = record.map((cell) => cell.trim());
    if (
      row.every((cell) => !cell) ||
      row[0]?.startsWith('Dokument ma charakter informacyjny')
    )
      continue;
    if (row.length !== 14)
      throw new BadRequestException(
        `Wiersz ${index + 2}: oczekiwano 14 kolumn.`,
      );
    if (row[9] !== 'PLN')
      throw new BadRequestException(
        `Wiersz ${index + 2}: obsługiwane są rachunki rozliczane w PLN.`,
      );
    const signed = row[8].replace(/[\s']/g, '').replace(',', '.');
    if (!/^-?\d+(\.\d{1,2})?$/.test(signed))
      throw new BadRequestException(
        `Wiersz ${index + 2}: nieprawidłowa kwota.`,
      );
    const externalId = row[7].replace(/^'+|'+$/g, '');
    if (!externalId || ids.has(externalId))
      throw new BadRequestException(
        `Wiersz ${index + 2}: brak lub powtórzony numer transakcji.`,
      );
    ids.add(externalId);
    result.push({
      rawColumns: record,
      externalId,
      date: csvDate(row[0]),
      bookingDate: csvDate(row[1]),
      amount: money(signed.replace(/^-/, '')),
      incoming: !signed.startsWith('-'),
      counterparty: row[2],
      title: row[3],
      counterpartyAccount: row[4].replace(/[\s']/g, ''),
      details: row[6],
      currency: row[9],
      originalAmount: row[12],
      originalCurrency: row[13],
    });
  }
  if (!result.length || result.length > 5000)
    throw new BadRequestException(
      'Plik musi zawierać od 1 do 5000 transakcji.',
    );
  return result;
}

export function meterUsage(
  previous: { date: Date; value: number },
  current: { date: Date; value: number },
) {
  const days = (current.date.getTime() - previous.date.getTime()) / 86400000;
  if (days <= 0 || current.value < previous.value) return null;
  const usage = current.value - previous.value;
  return { days, usage, monthlyPace: (usage / days) * (365.2425 / 12) };
}
