import { tr } from "../i18n";
import type { Category, Expense, Income } from "./store";

export interface ChargePayment {
  id: string;
  chargeId: string;
  expenseId: string;
  dueDate: string;
  expense: Expense;
}
export interface RecurringCharge {
  demoSeed?: boolean;
  id: string;
  name: string;
  type: "SUBSCRIPTION" | "FIXED";
  amount: string;
  intervalMonths: number;
  anchorDate: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  categoryId: string | null;
  category: Category | null;
  matchPattern: string | null;
  website: string | null;
  notes: string | null;
  payments: ChargePayment[];
  monthlyEquivalent: string;
  yearlyEquivalent: string;
  nextDueDate: string | null;
}
export interface Occurrence {
  chargeId: string;
  dueDate: string;
  amount: string;
  paymentId: string | null;
}
export interface RecurringSummary {
  count: number;
  monthly: string;
  yearly: string;
  scheduled: string;
  yearScheduled: string;
  remaining: string;
  next30: string;
}
export interface RecurringState {
  charges: RecurringCharge[];
  occurrences: Occurrence[];
  yearOccurrences: Occurrence[];
  upcoming: { chargeId: string; dueDate: string; amount: string }[];
  suggestions: {
    chargeId: string;
    dueDate: string;
    expense: Expense;
    priceChanged: boolean;
  }[];
  totals: {
    all: RecurringSummary;
    subscriptions: RecurringSummary;
    fixed: RecurringSummary;
  };
}
export interface AnalyticsReport {
  from: string;
  to: string;
  scope: string;
  categoryId: string | null;
  totals: {
    spending: number;
    income: number;
    loan: number;
    surplus: number;
    previous: number;
    change: number;
  };
  previousFrom: string;
  legacyCount: number;
  completeMonths: boolean;
  categories: { id: string; name: string; color: string; amount: number }[];
  merchants: { name: string; amount: number }[];
  series: {
    month: string;
    spending: number;
    income: number;
    categories: { categoryId: string; amount: number }[];
  }[];
  daily: { date: string; spending: number; previous: number }[];
  budgets: {
    month: string;
    amount: string;
    categoryLimits: Record<string, string>;
  }[];
  expenses: Expense[];
  incomes: Income[];
}
export const chargeType = (type: string) =>
  type === "FIXED" ? tr("Stała opłata") : tr("Subskrypcja");
export const cycleLabel = (months: number) =>
  months === 1
    ? tr("co miesiąc")
    : months === 3
      ? tr("co kwartał")
      : months === 12
        ? tr("co rok")
        : tr("co {0} mies.", { 0: months });
export const chargeStatus = (status: string) =>
  ({
    ACTIVE: tr("Aktywna"),
    PAUSED: tr("Wstrzymana"),
    ENDED: tr("Zakończona"),
  })[status] || status;
