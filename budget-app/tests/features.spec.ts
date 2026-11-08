import { test, expect, type Page } from "@playwright/test";
import type { State, Expense } from "../src/household/store";
import type {
  AnalyticsReport,
  RecurringCharge,
  RecurringSummary,
} from "../src/household/features";

test.beforeEach(async ({ page }) => {
  const date = new Date().toISOString().slice(0, 10);
  const month = date.slice(0, 7);
  const category = {
    id: "bills",
    name: "Rachunki",
    color: "#7ba8a3",
    excludedFromBudget: false,
    patterns: [],
  };
  const state: State = {
    categories: [category],
    sources: [{ id: "salary", name: "Pensja" }],
    expenses: [
      {
        id: "bank1",
        amount: "50",
        date,
        categoryId: category.id,
        category,
        description: "Spotify — opłata z wyciągu",
        merchant: "Spotify",
        kind: "EXPENSE",
        origin: "BANK",
        excludedFromBudget: false,
      },
    ],
    incomes: [
      {
        id: "income",
        amount: "4000",
        date,
        sourceId: "salary",
        source: { id: "salary", name: "Pensja" },
        description: "",
      },
    ],
    previousExpenses: [],
    accounts: [],
    budget: { amount: "4000", categoryLimits: { bills: "100" } },
    goals: [],
    meters: [],
    imports: [],
    rules: [],
    trend: [{ month, spending: "50", income: "4000" }],
  };
  const makeCharge = (
    id: string,
    name: string,
    type: "SUBSCRIPTION" | "FIXED",
    amount: string,
    intervalMonths: number,
  ): RecurringCharge => ({
    id,
    name,
    type,
    amount,
    intervalMonths,
    anchorDate: `${month}-01T00:00:00.000Z`,
    status: "ACTIVE",
    categoryId: category.id,
    category,
    matchPattern: name.toLowerCase(),
    website: null,
    notes: null,
    payments: [],
    monthlyEquivalent: (Number(amount) / intervalMonths).toFixed(2),
    yearlyEquivalent: ((Number(amount) * 12) / intervalMonths).toFixed(2),
    nextDueDate: `${month}-01`,
  });
  const charges = [
    makeCharge("spotify", "Spotify", "SUBSCRIPTION", "240", 12),
    makeCharge("rent", "Czynsz", "FIXED", "800", 1),
  ];
  const refresh = () => {
    const occurrences = charges
      .filter((charge) => charge.status === "ACTIVE")
      .map((charge) => ({
        chargeId: charge.id,
        dueDate: charge.anchorDate.slice(0, 10),
        amount: charge.amount,
        paymentId: charge.payments[0]?.id || null,
      }));
    const summary = (type?: string): RecurringSummary => {
      const active = charges.filter(
        (charge) =>
          charge.status === "ACTIVE" && (!type || charge.type === type),
      );
      const monthly = active.reduce(
        (sum, charge) => sum + Number(charge.amount) / charge.intervalMonths,
        0,
      );
      const scheduled = active
        .reduce((sum, charge) => sum + Number(charge.amount), 0)
        .toFixed(2);
      return {
        count: active.length,
        monthly: monthly.toFixed(2),
        yearly: (monthly * 12).toFixed(2),
        scheduled,
        yearScheduled: scheduled,
        remaining: scheduled,
        next30: scheduled,
      };
    };
    state.recurring = {
      charges,
      occurrences,
      yearOccurrences: occurrences,
      upcoming: occurrences,
      suggestions: [],
      totals: {
        all: summary(),
        fixed: summary("FIXED"),
        subscriptions: summary("SUBSCRIPTION"),
      },
    };
  };
  const link = (chargeId: string, expense: Expense, dueDate: string) => {
    const charge = charges.find((charge) => charge.id === chargeId)!;
    const id = `payment-${expense.id}`;
    expense.chargePayment = {
      id,
      chargeId,
      dueDate,
      charge: { id: charge.id, name: charge.name },
    };
    charge.payments.push({
      id,
      chargeId,
      expenseId: expense.id,
      expense,
      dueDate,
    });
    refresh();
    return { id };
  };
  refresh();
  await page.route("**/api/v1/household**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/analytics")) {
      const from = url.searchParams.get("from")!;
      const to = url.searchParams.get("to")!;
      const expenses = state.expenses.filter(
        (expense) =>
          expense.date.slice(0, 10) >= from && expense.date.slice(0, 10) <= to,
      );
      const spending = expenses.reduce(
        (sum, expense) => sum + Number(expense.amount),
        0,
      );
      const report: AnalyticsReport = {
        from,
        to,
        scope: url.searchParams.get("scope") || "budget",
        categoryId: null,
        totals: {
          spending,
          income: 4000,
          loan: 0,
          surplus: 4000 - spending,
          previous: 20,
          change: spending - 20,
        },
        previousFrom: "2026-01-01",
        legacyCount: 0,
        completeMonths: true,
        categories: [
          {
            id: category.id,
            name: category.name,
            color: category.color,
            amount: spending,
          },
        ],
        merchants: [{ name: "Spotify", amount: spending }],
        series: [
          {
            month,
            spending,
            income: 4000,
            categories: [{ categoryId: category.id, amount: spending }],
          },
        ],
        daily: [
          { date: from, spending: 0, previous: 0 },
          { date, spending, previous: 20 },
        ],
        budgets: [{ month, ...state.budget! }],
        expenses,
        incomes: state.incomes,
      };
      return route.fulfill({ json: report });
    }
    if (request.method() === "GET" && url.pathname.endsWith("/candidates"))
      return route.fulfill({
        json: state.expenses
          .filter((expense) => !expense.chargePayment)
          .map((expense) => ({
            ...expense,
            suggested: true,
            priceChanged: true,
          })),
      });
    if (request.method() === "GET") return route.fulfill({ json: state });
    if (request.method() === "PUT" && /\/expenses\/[^/]+$/.test(url.pathname)) {
      const expense = state.expenses.find(
        (e) => e.id === url.pathname.split("/").at(-1),
      )!;
      Object.assign(expense, request.postDataJSON());
      expense.amount = String(expense.amount);
      return route.fulfill({ json: expense });
    }
    if (request.method() === "POST" && url.pathname.endsWith("/payments")) {
      const body = request.postDataJSON();
      const chargeId = url.pathname.split("/").at(-2)!;
      return route.fulfill({
        status: 201,
        json: link(
          chargeId,
          state.expenses.find((expense) => expense.id === body.expenseId)!,
          body.dueDate,
        ),
      });
    }
    if (request.method() === "POST" && url.pathname.endsWith("/recurring")) {
      const body = request.postDataJSON();
      charges.push({
        ...makeCharge(
          "internet",
          body.name,
          body.type,
          String(body.amount),
          Number(body.intervalMonths),
        ),
        ...body,
      });
      refresh();
      return route.fulfill({ status: 201, json: { id: "internet" } });
    }
    if (request.method() === "POST" && url.pathname.endsWith("/expenses")) {
      const body = request.postDataJSON();
      const expense = {
        ...state.expenses[0]!,
        ...body,
        id: "manual",
        origin: "MANUAL",
        amount: String(body.amount),
      };
      state.expenses.push(expense);
      if (body.chargeId) link(body.chargeId, expense, body.dueDate);
      return route.fulfill({ status: 201, json: expense });
    }
    return route.fulfill({ json: {} });
  });
});

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("PLN monthly and annual summaries include subscriptions and fixed bills without spending money", async ({
  page,
}) => {
  const expenseWrites: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/expenses"))
      expenseWrites.push(request.url());
  });
  await page.goto("/recurring");
  await expect(page.locator(".feature-stat").nth(0)).toContainText("820,00");
  await expect(page.locator(".feature-stat").nth(1)).toContainText(
    /9\s?840,00/,
  );
  await page.getByRole("button", { name: "Stałe opłaty", exact: true }).click();
  await expect(page.locator(".feature-stat").nth(0)).toContainText("800,00");
  await page
    .getByRole("button", { name: "Dodaj opłatę", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Nazwa", exact: true })
    .fill("Internet");
  await page.getByLabel("Kwota (zł)", { exact: true }).fill("100");
  await page.getByLabel("Co ile miesięcy płacisz?", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Wszystkie", exact: true }).click();
  await expect(page.locator(".feature-stat").nth(0)).toContainText("853,33");
  await expect(page.locator(".feature-stat").nth(1)).toContainText(
    /10\s?240,00/,
  );
  await page.goto("/");
  await expect(page.locator(".hero-amount")).toContainText("50,00");
  expect(expenseWrites).toEqual([]);
});

test("a recorded payment is linked only after confirmation and does not create a second expense", async ({
  page,
}) => {
  const expenseWrites: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/expenses"))
      expenseWrites.push(request.url());
  });
  await page.goto("/recurring");
  await page
    .getByRole("button", { name: "Powiąż wydatek", exact: true })
    .first()
    .click();
  await choose(
    page,
    "Istniejący wydatek",
    "Sugestia · " +
      new Intl.DateTimeFormat("pl-PL", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(new Date()) +
      " · 50,00\u00a0zł · Spotify — opłata z wyciągu",
  );
  await expect(
    page.getByText(/Rzeczywista kwota różni się od planu/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Potwierdź powiązanie" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Potwierdzony wydatek", { exact: false }).first(),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.locator(".hero-amount")).toContainText("50,00");
  expect(expenseWrites).toEqual([]);
});

test("adding a manual bill is an explicit financial action linked to its scheduled date", async ({
  page,
}) => {
  await page.goto("/recurring");
  const request = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/expenses"),
  );
  await page
    .getByRole("button", { name: "Dodaj koszt", exact: true })
    .first()
    .click();
  await expect(
    page.getByText(/Ten nowy koszt zostanie powiązany/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({
    chargeId: "spotify",
    amount: "240",
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/");
  await expect(page.locator(".hero-amount")).toContainText("290,00");
});

test("analytical charts work on mobile, respect period controls and drill down to transactions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (entry) => {
    if (entry.type() === "error") errors.push(entry.text());
  });
  await page.goto("/analytics");
  await expect(
    page.getByRole("heading", { name: "Tempo wydawania" }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(3);
  await expect
    .poll(() =>
      page.locator("canvas").evaluateAll((nodes) =>
        nodes.every((node) => {
          const canvas = node as HTMLCanvasElement;
          return canvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height)
            .data.some((alpha, index) => index % 4 === 3 && alpha > 0);
        }),
      ),
    )
    .toBe(true);
  await choose(page, "Okres analizy", "Rok");
  await expect(page.getByText("Przygotowywanie analiz…")).toHaveCount(0);
  await page.getByRole("button", { name: "Kategorie", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kategorie w czasie" }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Sklepy", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "Kategorie", exact: true }).click();
  await page.locator(".donut-layout .list-row").first().click();
  await expect(page).toHaveURL(/transactions\?.*from=/);
  await expect(page.getByText(/Transakcje z analiz:/)).toBeVisible();
  await expect(page.getByText("Ładowanie wybranego zakresu…")).toHaveCount(0);
  await expect(page.locator(".transaction-item")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("mobile toolbars fill their rows and navigation preserves the recurring and analytical views on reload", async ({
  page,
  isMobile,
}) => {
  await page.goto("/recurring");
  await expect(page.locator(".page-heading .quick-add")).toHaveCount(0);
  await expect(page.locator(".bottom-nav a.active")).toHaveText("Więcej");
  if (isMobile) {
    const toolbar = page.locator(".mobile-toolbar");
    const bounds = await toolbar.boundingBox();
    const segments = await toolbar
      .getByRole("group", { name: "Rodzaj opłat" })
      .boundingBox();
    const add = await toolbar
      .getByRole("button", { name: "Dodaj opłatę", exact: true })
      .boundingBox();
    expect(segments!.width).toBeCloseTo(bounds!.width, 0);
    expect(add!.width).toBeCloseTo(bounds!.width, 0);
    expect(add!.height).toBeCloseTo(segments!.height, 0);
    const period = page.getByRole("group", { name: "Okres harmonogramu" });
    const periodWidth = await period.evaluate(
      (node) => node.getBoundingClientRect().width,
    );
    const headingWidth = await period.evaluate(
      (node) => node.parentElement!.getBoundingClientRect().width,
    );
    expect(periodWidth).toBeCloseTo(headingWidth, 0);
  }
  await page.getByRole("button", { name: "Stałe opłaty", exact: true }).click();
  await page.getByRole("button", { name: "Rok", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Stałe opłaty", exact: true }),
  ).toHaveClass(/active/);
  await expect(
    page.getByRole("button", { name: "Rok", exact: true }),
  ).toHaveClass(/active/);
  await expect(page.locator(".bottom-nav a.active")).toHaveText("Więcej");
  await page.goto("/analytics");
  await expect(page.locator(".page-heading .quick-add")).toHaveCount(0);
  await choose(page, "Okres analizy", "Rok");
  await page.getByRole("button", { name: "Sklepy", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Okres analizy", exact: true }),
  ).toContainText("Rok");
  await expect(
    page.getByRole("button", { name: "Sklepy", exact: true }),
  ).toHaveClass(/active/);
  await expect(page.locator("canvas")).toHaveCount(1);
  if (isMobile) {
    const group = page.getByRole("group", { name: "Widok analiz" });
    expect(
      await group.evaluate((node) => node.getBoundingClientRect().width),
    ).toBeCloseTo(
      await group.evaluate(
        (node) => node.parentElement!.getBoundingClientRect().width,
      ),
      0,
    );
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("category analysis shows all ordinary spending beside editable transactions and explicit quarter/year controls", async ({
  page,
}) => {
  await page.goto("/analytics");
  const ordinary = page.waitForRequest(
    (r) =>
      r.url().includes("/analytics?") &&
      new URL(r.url()).searchParams.get("categoryId") === "bills" &&
      new URL(r.url()).searchParams.get("scope") === "ordinary",
  );
  await choose(page, "Kategoria analizy", "Rachunki");
  await ordinary;
  await expect(page.locator(".category-analysis-total")).toContainText("50,00");
  await expect(
    page.locator(".category-transactions .transaction-row"),
  ).toHaveCount(1);
  await page.locator(".category-transactions .transaction-row").click();
  await page
    .getByRole("spinbutton", { name: "Kwota (zł)", exact: true })
    .fill("75.00");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.locator(".category-analysis-total")).toContainText("75,00");
  await expect(
    page.locator(".category-transactions .transaction-row"),
  ).toContainText("75,00");
  await choose(page, "Okres analizy", "Kwartał");
  await choose(page, "Kwartał analizy", "II kwartał · kwiecień–czerwiec");
  const quarterRequest = page.waitForRequest(
    (r) =>
      r.url().includes("/analytics?") &&
      new URL(r.url()).searchParams.get("from") === "2025-04-01" &&
      new URL(r.url()).searchParams.get("to") === "2025-06-30",
  );
  await choose(page, "Rok analizy", "2025");
  await quarterRequest;
  await expect(
    page.getByText("Brak transakcji tej kategorii w wybranym okresie."),
  ).toBeVisible();
  await choose(page, "Rok analizy", String(new Date().getFullYear()));
  const yearRequest = page.waitForRequest(
    (r) =>
      r.url().includes("/analytics?") &&
      new URL(r.url()).searchParams.get("from")?.endsWith("-01-01") === true &&
      new URL(r.url()).searchParams.get("to")?.endsWith("-12-31") === true,
  );
  await choose(page, "Okres analizy", "Rok");
  await yearRequest;
  await expect(page.locator(".category-analysis-total")).toContainText("75,00");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Kategoria analizy", exact: true }),
  ).toContainText("Rachunki");
  await expect(
    page.getByRole("combobox", { name: "Zakres wydatków", exact: true }),
  ).toContainText("Wszystkie zwykłe wydatki");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
