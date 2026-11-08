import { computed, reactive, ref } from "vue";
import { tr, intlLocale, translatedError } from "../i18n";
import axios from "axios";
import type { RecurringState } from "./features";
import { validMonth, viewPreference } from "./view-state";

export interface Category {
  demoSeed?: boolean;
  id: string;
  name: string;
  color: string;
  excludedFromBudget: boolean;
  patterns: { id: string; pattern: string }[];
}
export interface Expense {
  demoSeed?: boolean;
  id: string;
  amount: string;
  date: string;
  categoryId: string;
  category: Category;
  description: string;
  merchant: string;
  merchantId?: string | null;
  kind: string;
  origin: string;
  excludedFromBudget: boolean;
  raw?: { counterparty: string; title: string };
  importId?: string;
  chargePayment?: {
    id: string;
    chargeId: string;
    dueDate: string;
    charge: { id: string; name: string };
  } | null;
}
export interface Income {
  demoSeed?: boolean;
  id: string;
  amount: string;
  date: string;
  description: string;
  sourceId: string;
  source: { id: string; name: string };
}
export interface Contribution {
  id: string;
  amount: string;
  date: string;
}
export interface Goal {
  demoSeed?: boolean;
  id: string;
  name: string;
  target: string;
  initialAmount: string;
  startDate: string;
  deadline: string;
  contributions: Contribution[];
}
export interface Reading {
  id: string;
  date: string;
  value: number;
  meterTypeId: string;
}
export interface Meter {
  demoSeed?: boolean;
  id: string;
  name: string;
  unit: string;
  expectedMonthlyUsage: number | null;
  readings: Reading[];
  intervals: {
    date: string;
    days?: number;
    usage?: number;
    monthlyPace?: number;
  }[];
}
export interface Account {
  demoSeed?: boolean;
  id: string;
  name: string;
  number: string | null;
}
export interface Rule {
  id: string;
  pattern: string;
  merchant: string;
  categoryId: string | null;
  kind: string;
}
export interface Batch {
  id: string;
  filename: string;
  createdAt: string;
  account: Account;
  _count: { expenses: number; incomes?: number };
}
export interface State {
  merchants?: Merchant[];
  recurring?: RecurringState;
  trend: { month: string; spending: string; income: string }[];
  categories: Category[];
  sources: { id: string; name: string }[];
  expenses: Expense[];
  previousExpenses: Expense[];
  incomes: Income[];
  accounts: Account[];
  budget: { amount: string; categoryLimits: Record<string, string> } | null;
  goals: Goal[];
  meters: Meter[];
  imports: Batch[];
  rules: Rule[];
}
export interface Merchant {
  demoSeed?: boolean;
  id: string;
  name: string;
  _count: { expenses: number; aliases: number; rules?: number };
}

export const today = () => new Date().toLocaleDateString("sv-SE");
export const month = viewPreference("month", today().slice(0, 7), validMonth);
export const state = ref<State | null>(null);
export const loading = ref(false);
export const dataRevision = ref(0);
export const error = ref("");
export const toast = ref("");
export const api = axios.create({
  baseURL: "/api/v1/household",
  timeout: 30000,
});
export const isDemo = import.meta.env.VITE_DEMO_MODE === "true";
if (isDemo) {
  api.defaults.adapter = async (config) => {
    const { demoAdapter } = await import("./demo/adapter");
    return demoAdapter(config);
  };
}
let loadId = 0;
let toastTimer: ReturnType<typeof setTimeout>;
export function notify(message: string) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = "";
  }, 5000);
}
export function message(cause: unknown) {
  if (axios.isAxiosError(cause))
    return translatedError(
      cause.response?.data?.message ||
        (cause.response
          ? "Nie udało się wykonać operacji."
          : "Brak połączenia z domowym serwerem. Sprawdź sieć lub VPN."),
    );
  return cause instanceof Error
    ? translatedError(cause.message)
    : tr("Nie udało się wykonać operacji.");
}
export async function load() {
  const id = ++loadId;
  loading.value = true;
  error.value = "";
  try {
    const response = await api.get<State>("", {
      params: { month: month.value },
    });
    if (id === loadId) {
      state.value = response.data;
      dataRevision.value++;
    }
  } catch (cause) {
    if (id === loadId) {
      error.value = message(cause);
      state.value = null;
    }
  } finally {
    if (id === loadId) loading.value = false;
  }
}
export const cents = (value: unknown) => Math.round(Number(value || 0) * 100);
export const currency = (value: unknown) =>
  new Intl.NumberFormat(intlLocale(), {
    style: "currency",
    currency: "PLN",
  }).format(Number(value || 0));
export const number = (value: unknown, digits = 2) =>
  new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: digits }).format(
    Number(value || 0),
  );
export const shortDate = (value: string) =>
  new Intl.DateTimeFormat(intlLocale(), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
export const fullDate = (value: string) =>
  new Intl.DateTimeFormat(intlLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
export const monthLabel = computed(() =>
  new Intl.DateTimeFormat(intlLocale(), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month.value}-01T00:00:00Z`)),
);
export const signedCents = (expense: Expense) =>
  expense.kind === "REFUND" ? -cents(expense.amount) : cents(expense.amount);
export const inBudget = (expense: Expense) =>
  ["EXPENSE", "REFUND"].includes(expense.kind) &&
  !expense.excludedFromBudget &&
  !expense.category.excludedFromBudget;
export const totals = computed(() => {
  const data = state.value;
  const sum = (rows: Expense[]) =>
    rows.reduce((total, expense) => total + signedCents(expense), 0);
  const expenses = data?.expenses || [];
  const spending = sum(expenses.filter(inBudget));
  const actual = sum(
    expenses.filter((e) => ["EXPENSE", "REFUND"].includes(e.kind)),
  );
  const income = (data?.incomes || []).reduce(
    (sum, row) => sum + cents(row.amount),
    0,
  );
  const loan = sum(expenses.filter((e) => e.kind === "LOAN_OVERPAYMENT"));
  const contributions = (data?.goals || [])
    .flatMap((g) => g.contributions)
    .filter((c) => c.date.startsWith(month.value))
    .reduce((sum, c) => sum + cents(c.amount), 0);
  const limit = cents(data?.budget?.amount);
  return {
    spending: spending / 100,
    actual: actual / 100,
    income: income / 100,
    loan: loan / 100,
    contributions: contributions / 100,
    limit: limit / 100,
    left: (limit - spending) / 100,
    surplus: (income - actual - loan) / 100,
    available: (income - actual - loan - contributions) / 100,
    previous: sum((data?.previousExpenses || []).filter(inBudget)) / 100,
  };
});
export const categoryTotals = computed(() =>
  (state.value?.categories || [])
    .map((category) => ({
      ...category,
      total:
        (state.value?.expenses || [])
          .filter((e) => e.categoryId === category.id && inBudget(e))
          .reduce((sum, e) => sum + signedCents(e), 0) / 100,
    }))
    .sort((a, b) => b.total - a.total),
);
export const kindOptions = computed(() => [
  { value: "EXPENSE", label: tr("Wydatek") },
  { value: "REFUND", label: tr("Zwrot zakupu") },
  { value: "TRANSFER", label: tr("Przelew własny / gotówka") },
  { value: "LOAN_OVERPAYMENT", label: tr("Nadpłata kredytu") },
]);
export const kindLabel = (kind: string) =>
  kindOptions.value.find((option) => option.value === kind)?.label || kind;

export interface Field {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string; color?: string }[];
  hint?: string;
  step?: string;
  rows?: number;
  advanced?: boolean;
}
export const editor = reactive<{
  open: boolean;
  title: string;
  entity: string;
  id: string;
  fields: Field[];
  values: Record<string, any>;
}>({ open: false, title: "", entity: "", id: "", fields: [], values: {} });
export function edit(
  entity: string,
  item?: Record<string, any>,
  extra: Record<string, any> = {},
) {
  const categoryOptions =
    state.value?.categories.map((c) => ({
      value: c.id,
      label: c.name,
      color: c.color,
    })) || [];
  const sourceOptions =
    state.value?.sources.map((c) => ({ value: c.id, label: c.name })) || [];
  const date: Field = {
    key: "date",
    label: tr("Data"),
    type: "date",
    required: true,
  };
  const amount: Field = {
    key: "amount",
    label: tr("Kwota (zł)"),
    type: "number",
    required: true,
    step: "0.01",
  };
  const name: Field = { key: "name", label: tr("Nazwa"), required: true };
  const configs: Record<
    string,
    { title: string; fields: Field[]; defaults?: Record<string, any> }
  > = {
    expenses: {
      title: tr("Wydatek"),
      fields: [
        amount,
        {
          key: "categoryId",
          label: tr("Kategoria"),
          type: "select",
          options: categoryOptions,
          required: true,
        },
        { key: "description", label: tr("Opis"), type: "textarea", rows: 2 },
        date,
        { key: "merchant", label: tr("Sklep"), type: "merchant" },
        {
          key: "kind",
          label: tr("Rodzaj operacji"),
          type: "select",
          options: kindOptions.value,
          advanced: true,
        },
        {
          key: "excludedFromBudget",
          label: tr("Poza miesięcznym limitem"),
          type: "checkbox",
          advanced: true,
        },
      ],
      defaults: {
        kind: "EXPENSE",
        excludedFromBudget: false,
        merchantId: null,
      },
    },
    merchants: { title: tr("Sklep"), fields: [name] },
    incomes: {
      title: tr("Przychód"),
      fields: [
        amount,
        {
          key: "sourceId",
          label: tr("Źródło przychodu"),
          type: "select",
          options: sourceOptions,
          required: true,
        },
        date,
        { key: "description", label: tr("Opis") },
      ],
    },
    categories: {
      title: tr("Kategoria"),
      fields: [
        name,
        { key: "color", label: tr("Kolor"), type: "color" },
        {
          key: "excludedFromBudget",
          label: tr("Cała kategoria poza miesięcznym limitem"),
          type: "checkbox",
        },
        {
          key: "patternsText",
          label: tr("Fragmenty opisów przypisujące kategorię"),
          type: "textarea",
          hint: tr(
            "Jeden fragment w wierszu, minimum 3 znaki. Jeśli pasuje kilka kategorii, import poprosi o wybór.",
          ),
        },
      ],
      defaults: {
        color: "#497b78",
        excludedFromBudget: false,
        patternsText: "",
      },
    },
    sources: { title: tr("Źródło przychodu"), fields: [name] },
    accounts: {
      title: tr("Własne konto"),
      fields: [
        name,
        {
          key: "number",
          label: tr("Numer rachunku (26 cyfr)"),
          hint: tr(
            "Zapisz również własne konta oszczędnościowe. Dzięki temu rozpoznamy przelewy wewnętrzne.",
          ),
        },
      ],
    },
    goals: {
      title: tr("Cel oszczędnościowy"),
      fields: [
        name,
        {
          key: "target",
          label: tr("Kwota docelowa (zł)"),
          type: "number",
          step: "0.01",
          required: true,
        },
        {
          key: "initialAmount",
          label: tr("Już odłożone przed rozpoczęciem (zł)"),
          type: "number",
          step: "0.01",
          required: true,
        },
        {
          key: "startDate",
          label: tr("Data rozpoczęcia"),
          type: "date",
          required: true,
        },
        { key: "deadline", label: tr("Termin"), type: "date", required: true },
      ],
      defaults: { initialAmount: 0, startDate: today() },
    },
    contributions: { title: tr("Odłóż na cel"), fields: [amount, date] },
    meters: {
      title: tr("Licznik"),
      fields: [
        name,
        { key: "unit", label: tr("Jednostka"), required: true },
        {
          key: "expectedMonthlyUsage",
          label: tr("Miesięczne założenie dla całego domu"),
          type: "number",
          step: "0.001",
        },
      ],
    },
    readings: {
      title: tr("Odczyt licznika"),
      fields: [
        {
          key: "meterTypeId",
          label: tr("Licznik"),
          type: "select",
          options: state.value?.meters.map((m) => ({
            value: m.id,
            label: m.name,
          })),
          required: true,
        },
        {
          key: "value",
          label: tr("Stan licznika (narastająco)"),
          type: "number",
          step: "0.001",
          required: true,
        },
        date,
      ],
    },
    rules: {
      title: tr("Reguła rozpoznawania"),
      fields: [
        {
          key: "pattern",
          label: tr("Fragment danych bankowych"),
          required: true,
          hint: tr(
            "Np. jakdojade.pl. Najbardziej szczegółowa reguła ma pierwszeństwo.",
          ),
        },
        { key: "merchant", label: tr("Czytelna nazwa sprzedawcy") },
        {
          key: "categoryId",
          label: tr("Kategoria"),
          type: "select",
          options: categoryOptions,
        },
        {
          key: "kind",
          label: tr("Rodzaj operacji"),
          type: "select",
          options: kindOptions.value,
        },
      ],
      defaults: { kind: "EXPENSE" },
    },
    recurring: {
      title: tr("Opłata cykliczna"),
      fields: [
        name,
        {
          key: "type",
          label: tr("Rodzaj"),
          type: "select",
          required: true,
          options: [
            { value: "SUBSCRIPTION", label: tr("Subskrypcja") },
            { value: "FIXED", label: tr("Stała opłata") },
          ],
        },
        amount,
        {
          key: "intervalMonths",
          label: tr("Co ile miesięcy płacisz?"),
          type: "number",
          step: "1",
          required: true,
          hint: tr("1 — co miesiąc, 3 — co kwartał, 12 — co rok."),
        },
        {
          key: "anchorDate",
          label: tr("Pierwszy znany termin płatności"),
          type: "date",
          required: true,
          hint: tr(
            "Harmonogram liczymy od tej daty. Wpisanie opłaty nie dodaje wydatku do budżetu.",
          ),
        },
        {
          key: "categoryId",
          label: tr("Kategoria"),
          type: "select",
          options: categoryOptions,
        },
        {
          key: "status",
          label: tr("Status"),
          type: "select",
          required: true,
          options: [
            { value: "ACTIVE", label: tr("Aktywna") },
            { value: "PAUSED", label: tr("Wstrzymana") },
            { value: "ENDED", label: tr("Zakończona") },
          ],
        },
        {
          key: "matchPattern",
          label: tr("Fragment opisu na wyciągu"),
          hint: tr(
            "Np. spotify lub nazwa wspólnoty. Służy tylko do sugestii powiązania — zawsze potwierdzasz je samodzielnie.",
          ),
        },
        {
          key: "website",
          label: tr("Strona do zarządzania usługą"),
          type: "url",
        },
        { key: "notes", label: tr("Notatka"), type: "textarea" },
      ],
      defaults: {
        type: "SUBSCRIPTION",
        intervalMonths: 1,
        anchorDate: today(),
        status: "ACTIVE",
      },
    },
  };
  const config = configs[entity];
  if (!config) return;
  editor.title = tr(item ? "Edytuj: {0}" : "Dodaj: {0}", {
    0: config.title.toLocaleLowerCase(intlLocale()),
  });
  editor.entity = entity;
  editor.id = item?.id || "";
  editor.fields = config.fields;
  editor.values = { date: today(), ...config.defaults, ...item, ...extra };
  if (entity === "categories" && item)
    editor.values.patternsText = (item.patterns || [])
      .map((pattern: { pattern: string }) => pattern.pattern)
      .join("\n");
  for (const key of ["date", "startDate", "deadline", "anchorDate"])
    if (editor.values[key])
      editor.values[key] = String(editor.values[key]).slice(0, 10);
  editor.open = true;
}
export async function remove(
  entity: string,
  id: string,
  label = tr("ten wpis"),
) {
  if (
    !window.confirm(
      tr("Usunąć {0}? Tej operacji nie można cofnąć.", { 0: label }),
    )
  )
    return;
  try {
    await api.delete(`${entity}/${id}`);
    notify(tr("Usunięto wpis."));
    await load();
  } catch (cause) {
    notify(message(cause));
  }
}
