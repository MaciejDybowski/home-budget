import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Papa from 'papaparse';
import { BankRow, dateOnly, money, normalize } from './domain';

export const csvFields = [
  'date',
  'bookingDate',
  'title',
  'counterparty',
  'amount',
  'debit',
  'credit',
  'direction',
  'externalId',
  'currency',
  'counterpartyAccount',
  'details',
] as const;
type Field = (typeof csvFields)[number];
export interface CsvConfig {
  delimiter: string;
  encoding: 'utf-8' | 'windows-1250' | 'windows-1252';
  headerRow: number;
  hasHeader: boolean;
  dateFormat: string;
  decimal: ',' | '.';
  mode: 'signed' | 'debit-credit' | 'direction' | 'expense' | 'income';
  negativeIsExpense: boolean;
  debitValues: string;
  creditValues: string;
  columns: Partial<Record<Field, number>>;
  headers?: string[];
}
export interface CsvRow extends BankRow {
  rowNumber: number;
  syntheticId: boolean;
}
const fail = (message: string): never => {
  throw new BadRequestException(message);
};
const formats = [
  'DD.MM.YYYY',
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'DD-MM-YYYY',
  'YYYY/MM/DD',
];

export function validateCsvConfig(value: unknown): CsvConfig {
  if (!value || typeof value !== 'object') return fail('Brak ustawień CSV.');
  const c = value as CsvConfig;
  if (
    ![';', ',', '\t', '|'].includes(c.delimiter) ||
    !['utf-8', 'windows-1250', 'windows-1252'].includes(c.encoding) ||
    !Number.isInteger(c.headerRow) ||
    c.headerRow < 0 ||
    c.headerRow > 100 ||
    typeof c.hasHeader !== 'boolean' ||
    !formats.includes(c.dateFormat) ||
    ![',', '.'].includes(c.decimal) ||
    !['signed', 'debit-credit', 'direction', 'expense', 'income'].includes(
      c.mode,
    ) ||
    typeof c.negativeIsExpense !== 'boolean' ||
    typeof c.debitValues !== 'string' ||
    c.debitValues.length > 500 ||
    typeof c.creditValues !== 'string' ||
    c.creditValues.length > 500 ||
    !c.columns ||
    typeof c.columns !== 'object' ||
    Array.isArray(c.columns)
  )
    return fail('Nieprawidłowe ustawienia CSV.');
  for (const [key, index] of Object.entries(c.columns)) {
    if (
      !csvFields.includes(key as Field) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 99
    )
      return fail('Nieprawidłowe mapowanie kolumn.');
  }
  if (
    c.columns.date === undefined ||
    (c.columns.title === undefined && c.columns.counterparty === undefined)
  )
    return fail('Przypisz datę oraz opis lub kontrahenta.');
  if (
    c.mode === 'debit-credit'
      ? c.columns.debit === undefined || c.columns.credit === undefined
      : c.columns.amount === undefined
  )
    return fail('Przypisz kolumny kwoty.');
  if (c.mode === 'direction' && c.columns.direction === undefined)
    return fail('Przypisz kierunek operacji.');
  const indices = Object.values(c.columns);
  if (new Set(indices).size !== indices.length)
    return fail('Jedną kolumnę można przypisać tylko do jednego pola.');
  if (
    c.headers !== undefined &&
    (!Array.isArray(c.headers) ||
      c.headers.length > 100 ||
      c.headers.some((h) => typeof h !== 'string' || h.length > 1000))
  )
    return fail('Nieprawidłowe nagłówki.');
  return c;
}

function decode(buffer: Buffer, encoding?: string) {
  if (!buffer.length || buffer.length > 5 * 1024 * 1024)
    return fail('Plik musi mieć od 1 bajta do 5 MB.');
  try {
    return new TextDecoder(encoding || 'utf-8', { fatal: true })
      .decode(buffer)
      .replace(/^\uFEFF/, '');
  } catch {
    if (encoding) return fail('Nie można odczytać pliku w wybranym kodowaniu.');
    return new TextDecoder('windows-1250')
      .decode(buffer)
      .replace(/^\uFEFF/, '');
  }
}

function table(buffer: Buffer, settings?: Partial<CsvConfig>) {
  const decoded = decode(buffer, settings?.encoding);
  if (decoded.includes('\0')) return fail('Plik nie jest tekstowym CSV.');
  const parsed = Papa.parse<string[]>(decoded, {
    delimiter: settings?.delimiter || '',
    delimitersToGuess: [';', ',', '\t', '|'],
    skipEmptyLines: 'greedy',
  });
  // Broken quotes cannot safely be treated as individual invalid records.
  if (parsed.errors.some((e) => e.code !== 'UndetectableDelimiter'))
    return fail(`Nieprawidłowa struktura CSV: ${parsed.errors[0].message}`);
  if (
    parsed.data.length > 5102 ||
    parsed.data.some((r) => r.length > 100 || r.some((v) => v.length > 20000))
  )
    return fail(
      'Maksymalnie 5000 operacji, 100 kolumn i 20000 znaków w komórce.',
    );
  return { records: parsed.data, delimiter: parsed.meta.delimiter || ';' };
}

export function inspectCsv(buffer: Buffer, settings?: Partial<CsvConfig>) {
  if (
    settings &&
    ((settings.encoding !== undefined &&
      !['utf-8', 'windows-1250', 'windows-1252'].includes(settings.encoding)) ||
      (settings.delimiter !== undefined &&
        ![';', ',', '\t', '|'].includes(settings.delimiter)) ||
      (settings.headerRow !== undefined &&
        (!Number.isInteger(settings.headerRow) ||
          settings.headerRow < 0 ||
          settings.headerRow > 100)))
  )
    return fail('Nieprawidłowe ustawienia odczytu pliku.');
  const { records, delimiter } = table(buffer, settings);
  let encoding: CsvConfig['encoding'] = settings?.encoding || 'utf-8';
  if (!settings?.encoding) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      encoding = 'windows-1250';
    }
  }
  const guessedRow = records
    .slice(0, 101)
    .findIndex(
      (r) =>
        r.some((v) => /data|date/i.test(v)) &&
        r.some((v) => /kwota|amount|obci[aą][zż]enie|debit/i.test(v)),
    );
  const headerRow = settings?.headerRow ?? Math.max(0, guessedRow);
  const hasHeader = settings?.hasHeader ?? guessedRow >= 0;
  const header = records[headerRow];
  if (!header) return fail('Brak wierszy danych.');
  const headers = hasHeader
    ? header.map((v) => v.trim())
    : header.map((_, i) => `Kolumna ${i + 1}`);
  const columns: CsvConfig['columns'] = {};
  const aliases: Partial<Record<Field, RegExp>> = {
    date: /^(data transakcji|data operacji|data|transaction date|date|operation date)$/,
    bookingDate: /^(data ksiegowania|booking date|posting date)$/,
    title: /^(tytul|tytul przelewu|opis|description|title|payment title)$/,
    counterparty:
      /^(dane kontrahenta|kontrahent|odbiorca|nadawca|counterparty|merchant|payee|nazwa kontrahenta)$/,
    amount:
      /^(kwota|kwota transakcji \(waluta rachunku\)|kwota transakcji|wartosc|amount|value)$/,
    debit: /^(obciazenie|debit|rozchod|wydatki)$/,
    credit: /^(uznanie|credit|przychod|wplywy)$/,
    direction: /^(kierunek|typ operacji|direction|type)$/,
    externalId:
      /^(nr transakcji|id|transaction id|identyfikator|numer operacji|numer transakcji)$/,
    currency: /^(waluta|currency)$/,
    counterpartyAccount:
      /^(nr rachunku|nr rachunku kontrahenta|rachunek kontrahenta|counterparty account)$/,
    details: /^(szczegoly|szczegoly transakcji|details)$/,
  };
  if (hasHeader)
    for (const field of csvFields) {
      const index = headers.findIndex((h) =>
        aliases[field]?.test(normalize(h)),
      );
      if (index >= 0) columns[field] = index;
    }
  const samples = records.slice(
    headerRow + (hasHeader ? 1 : 0),
    headerRow + (hasHeader ? 1 : 0) + 8,
  );
  const sampleDate = samples[0]?.[columns.date ?? -1] || '';
  const dateFormat = /^\d{4}-/.test(sampleDate)
    ? 'YYYY-MM-DD'
    : /^\d{4}\//.test(sampleDate)
      ? 'YYYY/MM/DD'
      : /^\d{1,2}\//.test(sampleDate)
        ? 'DD/MM/YYYY'
        : /^\d{1,2}-/.test(sampleDate)
          ? 'DD-MM-YYYY'
          : 'DD.MM.YYYY';
  const amount =
    samples
      .map((r) => r[columns.amount ?? columns.debit ?? -1] || '')
      .find(Boolean) || '';
  const config: CsvConfig = {
    delimiter,
    encoding,
    headerRow,
    hasHeader,
    headers,
    dateFormat,
    decimal: amount.lastIndexOf('.') > amount.lastIndexOf(',') ? '.' : ',',
    mode:
      columns.debit !== undefined && columns.credit !== undefined
        ? 'debit-credit'
        : columns.direction !== undefined
          ? 'direction'
          : 'signed',
    negativeIsExpense: true,
    debitValues: 'obciążenie;debit;wydatek;out;D',
    creditValues: 'uznanie;credit;wpływ;in;C',
    columns,
  };
  return {
    config,
    headers,
    samples,
    recordCount: records.length - headerRow - (hasHeader ? 1 : 0),
    ambiguousDate: dateFormat === 'DD/MM/YYYY',
  };
}

function csvDate(value: string, format: string) {
  const tokens = format.split(/[./-]/);
  const separator = format.includes('.')
    ? '.'
    : format.includes('/')
      ? '/'
      : '-';
  const parts = value.trim().split(separator);
  if (
    parts.length !== 3 ||
    parts.some(
      (p, i) => !(tokens[i] === 'YYYY' ? /^\d{4}$/ : /^\d{1,2}$/).test(p),
    )
  )
    return fail(`Nieprawidłowa data „${value}” dla formatu ${format}.`);
  const get = (token: string) => parts[tokens.indexOf(token)].padStart(2, '0');
  const iso = `${get('YYYY')}-${get('MM')}-${get('DD')}`;
  dateOnly(iso);
  return iso;
}

function signedMoney(value: string, decimal: string) {
  let v = value
    .trim()
    .replace(/[\s\u00a0']/g, '')
    .replace(/\u2212/g, '-');
  if (/^\(.*\)$/.test(v)) v = `-${v.slice(1, -1)}`;
  const thousands = decimal === ',' ? '.' : ',';
  const unsigned = v.replace(/^[+-]/, '');
  const [whole, fraction, ...rest] = unsigned.split(decimal);
  if (
    rest.length ||
    (fraction !== undefined && !/^\d{1,2}$/.test(fraction)) ||
    !new RegExp(`^(?:\\d+|\\d{1,3}(?:\\${thousands}\\d{3})+)$`).test(whole)
  )
    return fail(`Nieprawidłowa kwota „${value}”.`);
  const normalized =
    whole.split(thousands).join('') +
    (fraction === undefined ? '' : `.${fraction}`);
  const amount = money(normalized);
  return { amount, negative: v.startsWith('-') };
}

export function parseCsv(buffer: Buffer, value: unknown) {
  const config = validateCsvConfig(value);
  const { records } = table(buffer, config);
  const header = records[config.headerRow];
  if (!header) return fail('Nie znaleziono wiersza początkowego.');
  if (
    config.hasHeader &&
    config.headers &&
    JSON.stringify(header.map((v) => v.trim())) !==
      JSON.stringify(config.headers)
  )
    return fail('Układ kolumn się zmienił. Ponownie sprawdź mapowanie.');
  const width = header.length;
  if (Object.values(config.columns).some((i) => i >= width))
    return fail('Mapowanie wskazuje nieistniejącą kolumnę.');
  const rows: CsvRow[] = [];
  const errors: { rowNumber: number; message: string; cells: string[] }[] = [];
  const ids = new Set<string>();
  const occurrences = new Map<string, number>();
  const data = records.slice(config.headerRow + (config.hasHeader ? 1 : 0));
  if (!data.length || data.length > 5000)
    return fail('Plik musi zawierać od 1 do 5000 operacji.');
  for (const [index, cells] of data.entries()) {
    const rowNumber = config.headerRow + (config.hasHeader ? 1 : 0) + index + 1;
    // ING exports include this informational footer; it is not a transaction.
    if (
      width === 14 &&
      header[0] === 'Data transakcji' &&
      config.columns.externalId === 7 &&
      cells[0]?.startsWith('Dokument ma charakter informacyjny')
    )
      continue;
    try {
      if (cells.length !== width)
        fail(`Oczekiwano ${width} kolumn, otrzymano ${cells.length}.`);
      const get = (field: Field) =>
        config.columns[field] === undefined
          ? ''
          : cells[config.columns[field]].trim();
      const date = csvDate(get('date'), config.dateFormat);
      const bookingDate = get('bookingDate')
        ? csvDate(get('bookingDate'), config.dateFormat)
        : date;
      let amount: string, incoming: boolean;
      if (config.mode === 'debit-credit') {
        const debit = get('debit'),
          credit = get('credit');
        const nonzero = (s: string) => s && !/^[+-]?[0\s.,]+$/.test(s);
        if (Boolean(nonzero(debit)) === Boolean(nonzero(credit)))
          fail(
            'Dokładnie jedna z kolumn obciążenie/uznanie musi zawierać niezerową kwotę.',
          );
        incoming = !nonzero(debit);
        const parsed = signedMoney(incoming ? credit : debit, config.decimal);
        if (parsed.negative)
          fail(
            'W osobnych kolumnach obciążenia i uznania kwoty muszą być dodatnie.',
          );
        amount = parsed.amount;
      } else {
        const parsed = signedMoney(get('amount'), config.decimal);
        amount = parsed.amount;
        incoming =
          config.mode === 'income' ||
          (config.mode === 'signed' &&
            parsed.negative !== config.negativeIsExpense);
        if (config.mode === 'direction') {
          const direction = normalize(get('direction'));
          const is = (values: string) =>
            values
              .split(';')
              .map(normalize)
              .filter(Boolean)
              .includes(direction);
          if (is(config.debitValues) === is(config.creditValues))
            fail('Nieznany lub niejednoznaczny kierunek operacji.');
          incoming = is(config.creditValues);
        }
      }
      const currency = get('currency').toUpperCase() || 'PLN';
      if (currency !== 'PLN') fail('Obsługiwana jest kwota rozliczona w PLN.');
      const title = get('title'),
        counterparty = get('counterparty');
      if (!title && !counterparty) fail('Brak opisu i kontrahenta.');
      if (title.length > 2000 || counterparty.length > 2000)
        fail('Opis lub kontrahent jest zbyt długi (maks. 2000 znaków).');
      let externalId = get('externalId').replace(/^'+|'+$/g, '');
      const syntheticId = !externalId;
      if (config.columns.externalId !== undefined && !externalId)
        fail('Pusty identyfikator w przypisanej kolumnie.');
      if (externalId.length > 250) fail('Identyfikator jest zbyt długi.');
      if (syntheticId) {
        const hash = createHash('sha256')
          .update(
            JSON.stringify([
              date,
              bookingDate,
              amount,
              incoming,
              normalize(title),
              normalize(counterparty),
              get('counterpartyAccount'),
            ]),
          )
          .digest('hex');
        const occurrence = (occurrences.get(hash) || 0) + 1;
        occurrences.set(hash, occurrence);
        externalId = `csv:${hash}:${occurrence}`;
      }
      if (ids.has(externalId))
        fail('Powtórzony identyfikator operacji w pliku.');
      ids.add(externalId);
      rows.push({
        rawColumns: cells,
        externalId,
        syntheticId,
        rowNumber,
        date,
        bookingDate,
        amount,
        incoming,
        title,
        counterparty,
        counterpartyAccount: get('counterpartyAccount').replace(/[\s']/g, ''),
        details: get('details'),
        currency,
        originalAmount: '',
        originalCurrency: '',
      });
    } catch (error) {
      errors.push({
        rowNumber,
        message:
          error instanceof Error ? error.message : 'Nieprawidłowy wiersz.',
        cells,
      });
    }
  }
  return { config, rows, errors };
}
