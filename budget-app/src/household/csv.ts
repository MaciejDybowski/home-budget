import { computed } from "vue";
import { tr } from "../i18n";
export interface CsvConfig {
  delimiter: string;
  encoding: string;
  headerRow: number;
  hasHeader: boolean;
  dateFormat: string;
  decimal: string;
  mode: string;
  negativeIsExpense: boolean;
  debitValues: string;
  creditValues: string;
  columns: Record<string, number>;
  headers?: string[];
}
export interface CsvInspection {
  config: CsvConfig;
  headers: string[];
  samples: string[][];
  recordCount: number;
  ambiguousDate: boolean;
}
export interface CsvTemplate {
  id: string;
  name: string;
  config: CsvConfig;
}
export interface CsvError {
  rowNumber: number;
  message: string;
  cells: string[];
}
export const mappingFields = computed(() => [
  { key: "date", label: tr("Data operacji"), required: true },
  { key: "title", label: tr("Tytuł / opis") },
  { key: "counterparty", label: tr("Odbiorca / nadawca") },
  {
    key: "amount",
    label: tr("Kwota"),
    modes: ["signed", "direction", "expense", "income"],
    required: true,
  },
  {
    key: "debit",
    label: tr("Obciążenie (wydatek)"),
    modes: ["debit-credit"],
    required: true,
  },
  {
    key: "credit",
    label: tr("Uznanie (wpływ)"),
    modes: ["debit-credit"],
    required: true,
  },
  {
    key: "direction",
    label: tr("Kierunek operacji"),
    modes: ["direction"],
    required: true,
  },
  { key: "externalId", label: tr("Numer / ID operacji") },
  { key: "bookingDate", label: tr("Data księgowania") },
  { key: "currency", label: tr("Waluta") },
  { key: "counterpartyAccount", label: tr("Rachunek kontrahenta") },
  { key: "details", label: tr("Dodatkowy opis") },
]);
export function activeCsvConfig(config: CsvConfig): CsvConfig {
  const allowed = mappingFields.value
    .filter((f) => !f.modes || f.modes.includes(config.mode))
    .map((f) => f.key);
  return {
    ...config,
    columns: Object.fromEntries(
      Object.entries(config.columns).filter(([key]) => allowed.includes(key)),
    ),
  };
}
