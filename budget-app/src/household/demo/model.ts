import type {
  Account,
  Batch,
  Category,
  Expense,
  Goal,
  Income,
  Merchant,
  Meter,
  Rule,
  State,
} from "../store";
import type {
  AnalyticsReport,
  ChargePayment,
  Occurrence,
  RecurringCharge,
  RecurringState,
  RecurringSummary,
} from "../features";

const key = "homebudget.public-demo.v1";
const id = () => crypto.randomUUID();
const currentMonth = () => new Date().toLocaleDateString("sv-SE").slice(0, 7);
const shifted = (month: string, delta: number) =>
  new Date(
    Date.UTC(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)) - 1 + delta,
      1,
    ),
  )
    .toISOString()
    .slice(0, 7);
const day = (month: string, value: number) =>
  `${month}-${String(Math.min(value, new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate())).padStart(2, "0")}`;
const cents = (value: unknown) => Math.round(Number(value || 0) * 100);
const money = (value: number) => (value / 100).toFixed(2);
const ordinary = (row: Expense) => ["EXPENSE", "REFUND"].includes(row.kind);
const signed = (row: Expense) =>
  cents(row.amount) * (row.kind === "REFUND" ? -1 : 1);
const sum = (rows: Expense[]) =>
  rows.reduce((total, row) => total + signed(row), 0);

interface Database {
  schema: 2;
  anchor: string;
  categories: Category[];
  sources: { id: string; name: string }[];
  accounts: Account[];
  merchants: Merchant[];
  expenses: Expense[];
  incomes: Income[];
  goals: Goal[];
  meters: Meter[];
  recurring: RecurringCharge[];
  payments: ChargePayment[];
  budgets: Record<string, NonNullable<State["budget"]>>;
  rules: Rule[];
  imports: Batch[];
}

function seed(): Database {
  const anchor = currentMonth();
  const categories: Category[] = [
    ["food", "Zakupy spożywcze", "#afcdb8"],
    ["home", "Dom i rachunki", "#a6c4dc"],
    ["transport", "Transport", "#e6c99b"],
    ["life", "Czas dla siebie", "#cab7d7"],
    ["health", "Zdrowie", "#dbb5af"],
    ["other", "Pozostałe", "#bdc8cf"],
  ].map(([categoryId, name, color]) => ({
    id: categoryId!,
    demoSeed: true,
    name: name!,
    color: color!,
    excludedFromBudget: false,
    patterns: [],
  }));
  const sources = [
    { id: "salary-1", name: "Wynagrodzenie — osoba A", demoSeed: true },
    { id: "salary-2", name: "Wynagrodzenie — osoba B", demoSeed: true },
  ];
  const merchants = [
    "Zielony Market",
    "Piekarnia za rogiem",
    "Domowa Energia",
    "Miejska Kawa",
    "Księgarnia Papier",
    "Muzyka Plus",
    "Stacja Po drodze",
  ].map((name, index) => ({
    id: `shop-${index}`,
    name,
    _count: { expenses: 0, aliases: 0, rules: 0 },
    demoSeed: true,
  }));
  const db: Database = {
    schema: 2,
    anchor,
    categories,
    sources,
    merchants,
    accounts: [
      {
        id: "account-demo",
        name: "Konto domowe — demo",
        number: null,
        demoSeed: true,
      },
    ],
    expenses: [],
    incomes: [],
    goals: [],
    meters: [],
    recurring: [],
    payments: [],
    budgets: {},
    rules: [],
    imports: [],
  };
  const purchases: [number, string, number, string, number?][] = [
    [2450, "home", 1, "Mieszkanie i opłaty"],
    [146.8, "food", 2, "Zakupy na początek tygodnia", 0],
    [32.6, "food", 3, "Świeże pieczywo", 1],
    [185, "transport", 4, "Bilet miesięczny"],
    [189.5, "home", 5, "Energia elektryczna", 2],
    [39.99, "life", 2, "Muzyka na co dzień", 5],
    [215.7, "food", 7, "Zakupy domowe", 0],
    [36, "life", 8, "Kawa we dwoje", 3],
    [89, "health", 9, "Apteka"],
    [74.9, "life", 10, "Książka na weekend", 4],
    [210, "transport", 12, "Tankowanie", 6],
    [127.4, "food", 13, "Warzywa i owoce", 0],
    [99, "home", 14, "Internet"],
    [155, "health", 16, "Wizyta kontrolna"],
    [196.2, "food", 17, "Zakupy na kilka dni", 0],
    [78, "life", 19, "Wieczór w kinie"],
    [31.5, "food", 20, "Chleb i coś słodkiego", 1],
    [164.3, "food", 22, "Zakupy spożywcze", 0],
    [58, "other", 23, "Drobiazgi do domu"],
    [42, "life", 25, "Spotkanie przy kawie", 3],
    [208.9, "food", 27, "Uzupełnienie zapasów", 0],
    [115, "other", 28, "Prezent urodzinowy"],
  ];
  for (let offset = -11; offset <= 0; offset++) {
    const month = shifted(anchor, offset);
    const maxDay = offset === 0 ? new Date().getDate() : 31;
    const factor = 1 + (((offset + 12) % 5) - 2) * 0.035;
    for (const [
      index,
      [amount, categoryId, at, description, shop],
    ] of purchases.entries()) {
      const merchant = shop == null ? undefined : merchants[shop];
      db.expenses.push({
        id: `expense-${month}-${index}`,
        amount: money(
          Math.round(amount * 100 * (index === 0 || index === 5 ? 1 : factor)),
        ),
        categoryId,
        category: categories.find((category) => category.id === categoryId)!,
        date: day(month, Math.min(at, maxDay)),
        description,
        merchant: merchant?.name || "",
        merchantId: merchant?.id || null,
        kind: "EXPENSE",
        origin: "MANUAL",
        excludedFromBudget: false,
        demoSeed: true,
      });
    }
    db.expenses.push({
      ...db.expenses.at(-1)!,
      id: `refund-${month}`,
      amount: "24.90",
      kind: "REFUND",
      categoryId: "food",
      category: categories[0]!,
      merchantId: merchants[0]!.id,
      merchant: merchants[0]!.name,
      description: "Zwrot za zakupy",
      date: day(month, Math.min(21, maxDay)),
      demoSeed: true,
    });
    for (const [index, source] of sources.entries())
      db.incomes.push({
        id: `income-${month}-${index}`,
        amount: index === 0 ? "6200.00" : "4600.00",
        date: day(month, 1),
        description: "Fikcyjne wynagrodzenie",
        sourceId: source.id,
        source,
        demoSeed: true,
      });
    db.budgets[month] = {
      amount: "7200.00",
      categoryLimits: {
        food: "1800",
        home: "3200",
        life: "650",
        transport: "600",
        health: "500",
      },
    };
  }
  db.goals = [
    {
      id: "goal-holiday",
      demoSeed: true,
      name: "Wspólny wyjazd",
      target: "12000.00",
      initialAmount: "2500.00",
      startDate: day(shifted(anchor, -5), 1),
      deadline: day(shifted(anchor, 7), 1),
      contributions: [-4, -3, -2, -1, 0].map((offset) => ({
        id: `saving-${offset}`,
        amount: "650.00",
        date: day(shifted(anchor, offset), 1),
      })),
    },
    {
      id: "goal-cushion",
      demoSeed: true,
      name: "Finansowa poduszka",
      target: "30000",
      initialAmount: "18000",
      startDate: day(shifted(anchor, -8), 1),
      deadline: day(shifted(anchor, 12), 1),
      contributions: [],
    },
  ];
  db.meters = [
    {
      id: "meter-water",
      demoSeed: true,
      name: "Woda",
      unit: "m³",
      expectedMonthlyUsage: 5,
      readings: [-5, -4, -3, -2, -1, 0].map((offset, index) => ({
        id: `reading-${index}`,
        meterTypeId: "meter-water",
        date: day(shifted(anchor, offset), 1),
        value: 123 + index * 4.3,
      })),
      intervals: [],
    },
  ];
  db.recurring = [
    {
      id: "charge-music",
      name: "Muzyka Plus",
      amount: "39.99",
      type: "SUBSCRIPTION",
      categoryId: "life",
      matchPattern: "muzyka",
    },
    {
      id: "charge-internet",
      name: "Internet domowy",
      amount: "99.00",
      type: "FIXED",
      categoryId: "home",
      matchPattern: "internet",
    },
    {
      id: "charge-insurance",
      name: "Ubezpieczenie mieszkania",
      amount: "480.00",
      type: "FIXED",
      categoryId: "home",
      matchPattern: "ubezpieczenie",
      intervalMonths: 12,
    },
  ].map((row) => ({
    ...row,
    demoSeed: true,
    type: row.type as RecurringCharge["type"],
    intervalMonths: row.intervalMonths || 1,
    anchorDate: day(anchor, row.id === "charge-insurance" ? 20 : 2),
    status: "ACTIVE",
    category: categories.find((category) => category.id === row.categoryId)!,
    notes: null,
    website: null,
    payments: [],
    monthlyEquivalent: "0",
    yearlyEquivalent: "0",
    nextDueDate: null,
  }));
  const expense = db.expenses.find((row) => row.id === `expense-${anchor}-5`)!;
  db.payments.push({
    id: "payment-music",
    chargeId: "charge-music",
    expenseId: expense.id,
    dueDate: day(anchor, 2),
    expense,
  });
  return db;
}

function restore(): Database {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved?.schema === 2 && saved.anchor === currentMonth()) return saved;
  } catch {
    /* A fresh sandbox replaces invalid or expired demo data. */
  }
  return seed();
}
let db = restore();
export function resetDemo() {
  localStorage.removeItem(key);
  for (const preference of Object.keys(sessionStorage)) {
    if (preference.startsWith("homebudget.view.v1."))
      sessionStorage.removeItem(preference);
  }
  db = seed();
}
const save = () => {
  localStorage.setItem(key, JSON.stringify(db));
};
const expenses = () =>
  db.expenses.map((row) => ({
    ...row,
    demoSeedMerchant: Boolean(
      db.merchants.find((merchant) => merchant.id === row.merchantId)?.demoSeed,
    ),
    category: db.categories.find((category) => category.id === row.categoryId)!,
    chargePayment: db.payments.find((payment) => payment.expenseId === row.id)
      ? {
          ...db.payments.find((payment) => payment.expenseId === row.id)!,
          charge: db.recurring.find(
            (charge) =>
              charge.id ===
              db.payments.find((payment) => payment.expenseId === row.id)!
                .chargeId,
          )!,
        }
      : null,
  }));
const incomes = () =>
  db.incomes.map((row) => ({
    ...row,
    source: db.sources.find((source) => source.id === row.sourceId)!,
  }));
function visible(row: Expense, scope: string) {
  return (
    ordinary(row) &&
    (scope === "ordinary" ||
      (!row.excludedFromBudget && !row.category.excludedFromBudget))
  );
}
function catalog() {
  return db.merchants
    .map((merchant) => ({
      ...merchant,
      _count: {
        expenses: db.expenses.filter((row) => row.merchantId === merchant.id)
          .length,
        aliases: 0,
        rules: db.rules.filter((rule) => rule.merchant === merchant.name)
          .length,
      },
    }))
    .sort(
      (a, b) =>
        b._count.expenses - a._count.expenses ||
        a.name.localeCompare(b.name, "pl"),
    );
}
function dates(
  charge: RecurringCharge,
  from: string,
  to: string,
): Occurrence[] {
  const result: Occurrence[] = [];
  for (let index = 0; index < 1200; index++) {
    const month = shifted(
      charge.anchorDate.slice(0, 7),
      index * Number(charge.intervalMonths),
    );
    const dueDate = day(month, Number(charge.anchorDate.slice(8, 10)));
    if (dueDate > to) break;
    if (dueDate >= from)
      result.push({
        chargeId: charge.id,
        dueDate,
        amount: charge.amount,
        paymentId:
          db.payments.find(
            (payment) =>
              payment.chargeId === charge.id && payment.dueDate === dueDate,
          )?.id || null,
      });
  }
  return result;
}
function recurring(month: string): RecurringState {
  const from = day(month, 1),
    to = day(month, 31);
  const charges = db.recurring.map((charge) => ({
    ...charge,
    category:
      db.categories.find((category) => category.id === charge.categoryId) ||
      null,
    payments: db.payments
      .filter((payment) => payment.chargeId === charge.id)
      .map((payment) => ({
        ...payment,
        expense: expenses().find((row) => row.id === payment.expenseId)!,
      })),
    monthlyEquivalent: money(
      Math.round(cents(charge.amount) / Number(charge.intervalMonths)),
    ),
    yearlyEquivalent: money(
      Math.round((cents(charge.amount) * 12) / Number(charge.intervalMonths)),
    ),
    nextDueDate:
      dates(charge, from, day(shifted(month, 24), 31)).find(
        (row) => !row.paymentId,
      )?.dueDate || null,
  }));
  const active = charges.filter((charge) => charge.status === "ACTIVE");
  const occurrences = active.flatMap((charge) => dates(charge, from, to));
  const yearOccurrences = active.flatMap((charge) =>
    dates(charge, `${month.slice(0, 4)}-01-01`, `${month.slice(0, 4)}-12-31`),
  );
  const upcoming = active
    .flatMap((charge) => dates(charge, from, day(shifted(month, 2), 31)))
    .filter((row) => !row.paymentId)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const summary = (type?: string): RecurringSummary => {
    const selected = active.filter((charge) => !type || charge.type === type);
    const ids = new Set(selected.map((charge) => charge.id));
    const amount = (rows: Occurrence[]) =>
      money(
        rows
          .filter((row) => ids.has(row.chargeId))
          .reduce((total, row) => total + cents(row.amount), 0),
      );
    return {
      count: selected.length,
      monthly: money(
        Math.round(
          selected.reduce(
            (total, charge) =>
              total + cents(charge.amount) / charge.intervalMonths,
            0,
          ),
        ),
      ),
      yearly: money(
        Math.round(
          selected.reduce(
            (total, charge) =>
              total + (cents(charge.amount) * 12) / charge.intervalMonths,
            0,
          ),
        ),
      ),
      scheduled: amount(occurrences),
      yearScheduled: amount(yearOccurrences),
      remaining: amount(occurrences.filter((row) => !row.paymentId)),
      next30: amount(
        upcoming.filter((row) => row.dueDate <= day(shifted(month, 1), 1)),
      ),
    };
  };
  return {
    charges,
    occurrences,
    yearOccurrences,
    upcoming,
    suggestions: [],
    totals: {
      all: summary(),
      subscriptions: summary("SUBSCRIPTION"),
      fixed: summary("FIXED"),
    },
  };
}

export function demoState(month: string): State {
  return {
    categories: db.categories,
    sources: db.sources,
    accounts: db.accounts,
    merchants: catalog(),
    expenses: expenses().filter((row) => row.date.startsWith(month)),
    previousExpenses: expenses().filter((row) =>
      row.date.startsWith(shifted(month, -1)),
    ),
    incomes: incomes().filter((row) => row.date.startsWith(month)),
    budget: db.budgets[month] || null,
    goals: db.goals,
    meters: db.meters.map((meter) => {
      const readings = [...meter.readings].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      return {
        ...meter,
        readings,
        intervals: readings.slice(1).map((row, index) => {
          const previous = readings[index]!;
          const days =
            (Date.parse(row.date) - Date.parse(previous.date)) / 86400000;
          return {
            date: row.date,
            days,
            usage: row.value - previous.value,
            monthlyPace: ((row.value - previous.value) * 30.4375) / days,
          };
        }),
      };
    }),
    imports: db.imports,
    rules: db.rules,
    recurring: recurring(month),
    trend: Array.from({ length: 12 }, (_, index) => {
      const at = shifted(month, index - 11);
      return {
        month: at,
        spending: money(
          sum(
            expenses().filter(
              (row) => row.date.startsWith(at) && visible(row, "budget"),
            ),
          ),
        ),
        income: money(
          db.incomes
            .filter((row) => row.date.startsWith(at))
            .reduce((total, row) => total + cents(row.amount), 0),
        ),
      };
    }),
  };
}

export function demoReport(
  from: string,
  to: string,
  scope = "budget",
  categoryId?: string,
): AnalyticsReport {
  const all = expenses();
  const eligible = (row: Expense) =>
    visible(row, scope) && (!categoryId || row.categoryId === categoryId);
  const selected = all.filter(
    (row) => row.date >= from && row.date <= to && eligible(row),
  );
  const household = all.filter((row) => row.date >= from && row.date <= to);
  const selectedIncomes = incomes().filter(
    (row) => row.date >= from && row.date <= to,
  );
  const income =
    selectedIncomes.reduce((total, row) => total + cents(row.amount), 0) / 100;
  const previousTo = new Date(Date.parse(from) - 86400000)
    .toISOString()
    .slice(0, 10);
  const previousFrom = new Date(
    Date.parse(previousTo) - (Date.parse(to) - Date.parse(from)),
  )
    .toISOString()
    .slice(0, 10);
  const previous = all.filter(
    (row) =>
      row.date >= previousFrom && row.date <= previousTo && eligible(row),
  );
  const spending = sum(selected) / 100;
  const months: string[] = [];
  for (
    let at = from.slice(0, 7);
    at <= to.slice(0, 7) && months.length < 360;
    at = shifted(at, 1)
  )
    months.push(at);
  const shops = new Map<string, { amount: number; demoSeed: boolean }>();
  for (const row of selected) {
    const name = row.merchant || row.description || "Bez sklepu";
    const current = shops.get(name);
    shops.set(name, {
      amount: (current?.amount || 0) + signed(row),
      demoSeed:
        current?.demoSeed ??
        Boolean(
          db.merchants.find((merchant) => merchant.id === row.merchantId)
            ?.demoSeed,
        ),
    });
  }
  return {
    from,
    to,
    scope,
    categoryId: categoryId || null,
    totals: {
      spending,
      income,
      loan:
        household
          .filter((row) => row.kind === "LOAN_OVERPAYMENT")
          .reduce((total, row) => total + cents(row.amount), 0) / 100,
      surplus:
        income -
        sum(household.filter(ordinary)) / 100 -
        household
          .filter((row) => row.kind === "LOAN_OVERPAYMENT")
          .reduce((total, row) => total + cents(row.amount), 0) /
          100,
      previous: sum(previous) / 100,
      change: spending - sum(previous) / 100,
    },
    previousFrom,
    legacyCount: 0,
    completeMonths: from.endsWith("-01") && to === day(to.slice(0, 7), 31),
    categories: db.categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        demoSeed: category.demoSeed,
        amount:
          sum(selected.filter((row) => row.categoryId === category.id)) / 100,
      }))
      .filter((row) => row.amount !== 0),
    merchants: [...shops]
      .map(([name, entry]) => ({
        name,
        amount: entry.amount / 100,
        demoSeed: entry.demoSeed,
      }))
      .sort((a, b) => b.amount - a.amount),
    series: months.map((month) => ({
      month,
      spending: sum(selected.filter((row) => row.date.startsWith(month))) / 100,
      income:
        selectedIncomes
          .filter((row) => row.date.startsWith(month))
          .reduce((total, row) => total + cents(row.amount), 0) / 100,
      categories: db.categories.map((category) => ({
        categoryId: category.id,
        amount:
          sum(
            selected.filter(
              (row) =>
                row.date.startsWith(month) && row.categoryId === category.id,
            ),
          ) / 100,
      })),
    })),
    daily: Array.from(
      {
        length: Math.min(
          1100,
          Math.max(
            0,
            Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1,
          ),
        ),
      },
      (_, index) => {
        const date = new Date(Date.parse(from) + index * 86400000)
          .toISOString()
          .slice(0, 10);
        const prior = new Date(Date.parse(previousFrom) + index * 86400000)
          .toISOString()
          .slice(0, 10);
        return {
          date,
          spending: sum(selected.filter((row) => row.date <= date)) / 100,
          previous: sum(previous.filter((row) => row.date <= prior)) / 100,
        };
      },
    ),
    budgets: months
      .filter((month) => db.budgets[month])
      .map((month) => ({ month, ...db.budgets[month]! })),
    expenses: selected.sort((a, b) => b.date.localeCompare(a.date)),
    incomes: selectedIncomes,
  };
}

type Row = { id: string; [key: string]: unknown };
function collection(entity: string): Row[] {
  const arrays = {
    expenses: db.expenses,
    incomes: db.incomes,
    merchants: db.merchants,
    categories: db.categories,
    sources: db.sources,
    accounts: db.accounts,
    goals: db.goals,
    meters: db.meters,
    recurring: db.recurring,
    rules: db.rules,
    imports: db.imports,
    payments: db.payments,
    readings: db.meters.flatMap((meter) => meter.readings),
    contributions: db.goals.flatMap((goal) => goal.contributions),
  };
  if (!(entity in arrays))
    throw new Error("Ta operacja nie jest dostępna w demo.");
  return arrays[entity as keyof typeof arrays] as unknown as Row[];
}
function resolveMerchant(input: Record<string, unknown>) {
  let merchant = db.merchants.find((row) => row.id === input.merchantId);
  const name = String(input.merchant || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (!merchant && name)
    merchant = db.merchants.find(
      (row) =>
        row.name.toLocaleLowerCase("pl") === name.toLocaleLowerCase("pl"),
    );
  if (!merchant && name) {
    merchant = {
      id: id(),
      name,
      _count: { expenses: 0, aliases: 0, rules: 0 },
    };
    db.merchants.push(merchant);
  }
  return { merchantId: merchant?.id || null, merchant: merchant?.name || "" };
}
function reassignMerchant(sourceId: string, targetId?: string) {
  const source = db.merchants.find((row) => row.id === sourceId);
  const target = db.merchants.find((row) => row.id === targetId);
  if (!source || (targetId && !target)) throw new Error("Nieznany sklep.");
  if (sourceId === targetId) throw new Error("Wybierz inny sklep docelowy.");
  for (const row of db.expenses.filter((row) => row.merchantId === sourceId)) {
    row.merchantId = target?.id || null;
    row.merchant = target?.name || "";
  }
  for (const rule of db.rules.filter((rule) => rule.merchant === source.name))
    rule.merchant = target?.name || "";
  db.merchants = db.merchants.filter((row) => row.id !== sourceId);
}
export function demoRequest(
  method: string,
  path: string,
  input: Record<string, unknown>,
  params: Record<string, string>,
): unknown {
  const [entity = "", rowId, action] = path.split("/");
  if (method === "get") {
    if (!entity) return demoState(params.month || currentMonth());
    if (entity === "analytics")
      return demoReport(
        params.from!,
        params.to!,
        params.scope,
        params.categoryId,
      );
    if (entity === "merchants") return catalog();
    if (entity === "recurring" && action === "candidates")
      return expenses()
        .filter(
          (row) =>
            row.kind === "EXPENSE" &&
            !db.payments.some((payment) => payment.expenseId === row.id) &&
            Math.abs(Date.parse(row.date) - Date.parse(params.dueDate!)) <=
              31 * 86400000,
        )
        .map((row) => ({
          ...row,
          suggested:
            row.categoryId ===
            db.recurring.find((charge) => charge.id === rowId)?.categoryId,
          priceChanged:
            cents(row.amount) !==
            cents(db.recurring.find((charge) => charge.id === rowId)?.amount),
        }));
    throw new Error("Ta funkcja wymaga własnej instalacji.");
  }
  if (entity === "demo" && rowId === "import") {
    if (db.imports.some((batch) => batch.filename === "przykladowe-zakupy.csv"))
      return { count: 0 };
    const batch = {
      id: id(),
      demoSeed: true,
      filename: "przykladowe-zakupy.csv",
      createdAt: new Date().toISOString(),
      account: db.accounts[0]!,
      _count: { expenses: 3, incomes: 0 },
    };
    for (const [index, amount] of ["86.40", "19.50", "48.00"].entries())
      db.expenses.push({
        id: id(),
        amount,
        date: new Date().toLocaleDateString("sv-SE"),
        description: [
          "Zakupy na weekend",
          "Świeże pieczywo",
          "Kawa i spotkanie",
        ][index]!,
        ...resolveMerchant({
          merchant: ["Zielony Market", "Piekarnia za rogiem", "Miejska Kawa"][
            index
          ],
        }),
        categoryId: index === 2 ? "life" : "food",
        category:
          db.categories.find(
            (row) => row.id === (index === 2 ? "life" : "food"),
          ) || db.categories[0]!,
        kind: "EXPENSE",
        origin: "BANK",
        excludedFromBudget: false,
        importId: batch.id,
        demoSeed: true,
      });
    db.imports.push(batch);
    save();
    return { count: 3 };
  }
  if (entity === "budgets" && rowId) {
    if (!Number.isFinite(cents(input.amount)) || cents(input.amount) < 0)
      throw new Error("Podaj poprawny limit budżetu.");
    db.budgets[rowId] = {
      amount: String(input.amount),
      categoryLimits: (input.categoryLimits || {}) as Record<string, string>,
    };
    save();
    return db.budgets[rowId];
  }
  if (entity === "merchants" && action === "merge") {
    reassignMerchant(rowId!, String(input.targetId));
    save();
    return {};
  }
  if (entity === "recurring" && action === "payments") {
    const expense = expenses().find((row) => row.id === input.expenseId);
    if (
      !expense ||
      db.payments.some(
        (payment) =>
          payment.expenseId === expense.id ||
          (payment.chargeId === rowId && payment.dueDate === input.dueDate),
      )
    )
      throw new Error("Ta płatność jest już powiązana.");
    db.payments.push({
      id: id(),
      chargeId: rowId!,
      expenseId: expense.id,
      dueDate: String(input.dueDate),
      expense,
    });
    save();
    return {};
  }
  if (entity === "goals" && action === "contributions") {
    if (!Number.isFinite(cents(input.amount)) || cents(input.amount) <= 0)
      throw new Error("Podaj dodatnią kwotę.");
    const goal = db.goals.find((row) => row.id === rowId)!;
    goal.contributions.push({
      id: id(),
      amount: String(input.amount),
      date: String(input.date),
    });
    save();
    return {};
  }
  const rows = collection(entity);
  const existing = rows.find((row) => row.id === rowId);
  if (method === "delete") {
    if (!existing) throw new Error("Nie znaleziono wpisu.");
    if (
      entity === "categories" &&
      db.expenses.some((row) => row.categoryId === rowId)
    )
      throw new Error("Kategoria jest używana w transakcjach.");
    if (
      entity === "sources" &&
      db.incomes.some((row) => row.sourceId === rowId)
    )
      throw new Error("Źródło jest używane w przychodach.");
    if (entity === "merchants") reassignMerchant(rowId!);
    else if (entity === "readings") {
      for (const meter of db.meters)
        meter.readings = meter.readings.filter((row) => row.id !== rowId);
    } else if (entity === "contributions") {
      for (const goal of db.goals)
        goal.contributions = goal.contributions.filter(
          (row) => row.id !== rowId,
        );
    } else rows.splice(rows.indexOf(existing), 1);
    if (entity === "imports")
      db.expenses = db.expenses.filter((row) => row.importId !== rowId);
    if (entity === "recurring")
      db.payments = db.payments.filter((row) => row.chargeId !== rowId);
    if (entity === "expenses")
      db.payments = db.payments.filter((row) => row.expenseId !== rowId);
  } else {
    const data: Row = {
      ...existing,
      ...input,
      id: existing?.id || id(),
      demoSeed: false,
    };
    if (
      "amount" in data &&
      (cents(data.amount) <= 0 || !Number.isFinite(cents(data.amount)))
    )
      throw new Error("Podaj dodatnią kwotę.");
    if (entity === "expenses") {
      if (!db.categories.some((row) => row.id === data.categoryId))
        throw new Error("Wybierz kategorię.");
      if (
        data.kind !== "EXPENSE" &&
        db.payments.some((payment) => payment.expenseId === data.id)
      )
        throw new Error(
          "Najpierw odłącz opłatę cykliczną przed zmianą rodzaju operacji.",
        );
      Object.assign(data, {
        amount: money(cents(data.amount)),
        origin: existing?.origin || "MANUAL",
        kind: data.kind || "EXPENSE",
        excludedFromBudget: Boolean(data.excludedFromBudget),
        description: data.description || "",
        ...resolveMerchant(data),
      });
    }
    if (entity === "merchants") {
      data.name = String(data.name).trim();
      if (
        db.merchants.some(
          (row) =>
            row.id !== data.id &&
            row.name.toLocaleLowerCase("pl") ===
              String(data.name).toLocaleLowerCase("pl"),
        )
      )
        throw new Error("Sklep o tej nazwie już istnieje.");
      for (const row of db.expenses.filter((row) => row.merchantId === data.id))
        row.merchant = String(data.name);
      for (const rule of db.rules.filter(
        (row) => row.merchant === existing?.name,
      ))
        rule.merchant = String(data.name);
      data._count = { expenses: 0, aliases: 0, rules: 0 };
    }
    if (entity === "categories") {
      data.patterns = String(data.patternsText || "")
        .split("\n")
        .filter(Boolean)
        .map((pattern) => ({ id: id(), pattern }));
      data.excludedFromBudget = Boolean(data.excludedFromBudget);
    }
    if (entity === "meters") {
      data.readings = existing?.readings || [];
      data.intervals = [];
    }
    if (entity === "goals") data.contributions = existing?.contributions || [];
    if (entity === "readings") {
      const value = Number(data.value);
      data.value = value;
      const meter = db.meters.find((row) => row.id === data.meterTypeId);
      if (!meter || !Number.isFinite(value) || value < 0)
        throw new Error("Podaj poprawny stan licznika.");
      const readings = [
        ...meter.readings.filter((row) => row.id !== data.id),
        data as unknown as Meter["readings"][number],
      ].sort((a, b) => a.date.localeCompare(b.date));
      for (let index = 1; index < readings.length; index++) {
        if (
          readings[index]!.date === readings[index - 1]!.date ||
          readings[index]!.value < readings[index - 1]!.value
        )
          throw new Error(
            "Odczyty muszą mieć różne daty i rosnące wskazania licznika.",
          );
      }
      if (!existing)
        db.meters
          .find((meter) => meter.id === data.meterTypeId)!
          .readings.push(data as unknown as Meter["readings"][number]);
    }
    if (entity === "recurring") {
      data.intervalMonths = Math.max(1, Number(data.intervalMonths));
      Object.assign(data, {
        payments: [],
        category: null,
        monthlyEquivalent: "0",
        yearlyEquivalent: "0",
        nextDueDate: null,
      });
    }
    if (existing) Object.assign(existing, data);
    else if (entity !== "readings") rows.push(data);
    if (entity === "expenses" && input.chargeId)
      db.payments.push({
        id: id(),
        chargeId: String(input.chargeId),
        expenseId: data.id,
        dueDate: String(input.dueDate),
        expense: data as unknown as Expense,
      });
  }
  save();
  return {};
}
