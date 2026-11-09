import { test, expect } from "@playwright/test";
import type { CsvConfig } from "../src/household/csv";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/status", route => route.fulfill({ json: { enabled: false, authenticated: false } }));
});

const csvConfig: CsvConfig = {
  delimiter: ";",
  encoding: "utf-8",
  headerRow: 0,
  hasHeader: true,
  dateFormat: "DD.MM.YYYY",
  decimal: ",",
  mode: "signed",
  negativeIsExpense: true,
  debitValues: "debit",
  creditValues: "credit",
  columns: { date: 0, title: 1, amount: 2 },
  headers: ["Data", "Opis", "Kwota"],
};

test("amount sorting is numeric and global across dates, filters, pages and income rows", async ({
  page,
}) => {
  const month = new Date().toISOString().slice(0, 7);
  const category = {
    id: "bills",
    name: "Rachunki",
    color: "#497b78",
    excludedFromBudget: false,
    patterns: [],
  };
  const base = {
    categoryId: category.id,
    category,
    merchant: "",
    kind: "EXPENSE",
    origin: "MANUAL",
    excludedFromBudget: false,
  };
  const data = {
    categories: [category],
    sources: [],
    accounts: [],
    goals: [],
    meters: [],
    imports: [],
    rules: [],
    trend: [],
    budget: null,
    previousExpenses: [],
    expenses: [
      {
        ...base,
        id: "a",
        date: `${month}-03`,
        amount: "100.10",
        description: "Zakup A",
      },
      {
        ...base,
        id: "b",
        date: `${month}-02`,
        amount: "100.05",
        description: "Zakup B",
      },
      {
        ...base,
        id: "c",
        date: `${month}-03`,
        amount: "80",
        description: "Zakup C",
      },
      {
        ...base,
        id: "d",
        date: `${month}-02`,
        amount: "9.99",
        description: "Zwrot D",
        kind: "REFUND",
      },
    ],
    incomes: [
      {
        id: "i1",
        date: `${month}-03`,
        amount: "9.99",
        sourceId: "s1",
        source: { id: "s1", name: "Mały przychód" },
        description: "",
      },
      {
        id: "i2",
        date: `${month}-02`,
        amount: "100.05",
        sourceId: "s2",
        source: { id: "s2", name: "Duży przychód" },
        description: "",
      },
      {
        id: "i3",
        date: `${month}-03`,
        amount: "80",
        sourceId: "s3",
        source: { id: "s3", name: "Średni przychód" },
        description: "",
      },
    ],
  };
  await page.route("**/api/v1/household**", (route) =>
    route.fulfill({ json: data }),
  );
  const sort = async (label: string) => {
    await page.getByRole("combobox", { name: "Sortowanie transakcji" }).click();
    await page.getByRole("option", { name: label, exact: true }).click();
  };
  await page.goto("/transactions");
  await sort("Kwota: od największej");
  await expect(page.locator(".transaction-title")).toHaveText([
    "Zakup A",
    "Zakup B",
    "Zakup C",
    "Zwrot D",
  ]);
  await expect(page.locator(".day-label")).toHaveCount(0);
  await expect(page.locator(".transaction-row time").first()).toHaveAttribute(
    "datetime",
    `${month}-03`,
  );
  await sort("Kwota: od najmniejszej");
  await expect(page.locator(".transaction-title")).toHaveText([
    "Zwrot D",
    "Zakup C",
    "Zakup B",
    "Zakup A",
  ]);
  await page
    .getByRole("searchbox", { name: "Szukaj transakcji" })
    .fill("Zakup");
  await expect(page.locator(".transaction-title")).toHaveText([
    "Zakup C",
    "Zakup B",
    "Zakup A",
  ]);
  await page.getByRole("searchbox", { name: "Szukaj transakcji" }).fill("");
  await page.getByRole("button", { name: "Przychody", exact: true }).click();
  await expect(page.locator(".transaction-row .row-copy strong")).toHaveText([
    "Mały przychód",
    "Średni przychód",
    "Duży przychód",
  ]);
  await sort("Kwota: od największej");
  await expect(page.locator(".transaction-row .row-copy strong")).toHaveText([
    "Duży przychód",
    "Średni przychód",
    "Mały przychód",
  ]);
  await page
    .getByRole("button", { name: "Wydatki i operacje", exact: true })
    .click();
  await sort("Najnowsze");
  await expect(page.locator(".day-label")).toHaveCount(2);
  await expect(page.locator(".transaction-row time")).toHaveCount(4);
  await expect(page.locator(".transaction-title")).toHaveText([
    "Zakup A",
    "Zakup C",
    "Zakup B",
    "Zwrot D",
  ]);
  data.expenses.push(
    ...Array.from({ length: 45 }, (_, index) => ({
      ...base,
      id: `extra-${String(index).padStart(2, "0")}`,
      date: `${month}-03`,
      amount: index === 44 ? "1000" : String(index + 1),
      description:
        index === 44 ? "Największa z dalszej strony" : `Dodatkowy ${index}`,
    })),
  );
  await page.reload();
  await expect(page.locator(".transaction-title")).toHaveCount(40);
  await sort("Kwota: od największej");
  await expect(page.locator(".transaction-title").first()).toHaveText(
    "Największa z dalszej strony",
  );
});

test.beforeEach(async ({ page }) => {
  const date = new Date().toISOString().slice(0, 10);
  const month = date.slice(0, 7);
  const category = {
    id: "food",
    name: "Żywność",
    color: "#ffff80",
    excludedFromBudget: false,
    patterns: [],
  };
  const expense = {
    id: "e1",
    amount: "12.50",
    date,
    merchant: "Lidl",
    categoryId: "food",
    category,
    description: "Zakupy domowe",
    kind: "EXPENSE",
    origin: "LEGACY",
    excludedFromBudget: false,
  };
  const data = {
    categories: [category, { ...category, id: "transport", name: "Transport" }],
    merchants: [
      {
        id: "lidl",
        name: "Lidl",
        _count: { expenses: 12, aliases: 2, rules: 0 },
      },
    ],
    sources: [{ id: "salary", name: "Wynagrodzenie" }],
    expenses: [
      expense,
      {
        ...expense,
        id: "loan",
        amount: "1000",
        merchant: "Nadpłata kredytu",
        kind: "LOAN_OVERPAYMENT",
      },
      {
        ...expense,
        id: "transfer",
        amount: "2000",
        merchant: "Przelew własny",
        kind: "TRANSFER",
      },
    ],
    previousExpenses: [],
    incomes: [
      {
        id: "i1",
        amount: "10000",
        date,
        source: { id: "salary", name: "Wynagrodzenie" },
        sourceId: "salary",
        description: "",
      },
    ],
    accounts: [{ id: "ing", name: "ING wspólne", number: null }],
    budget: { amount: "4000", categoryLimits: { food: "1000" } },
    goals: [
      {
        id: "goal",
        name: "Poduszka finansowa",
        target: "50000",
        initialAmount: "1000",
        startDate: date,
        deadline: `${Number(date.slice(0, 4)) + 1}-12-31`,
        contributions: [{ id: "c1", amount: "500", date }],
      },
    ],
    meters: [
      {
        id: "water",
        name: "Woda zimna",
        unit: "m³",
        expectedMonthlyUsage: 4,
        readings: [
          { id: "r1", date: `${month}-01`, value: 100, meterTypeId: "water" },
        ],
        intervals: [{ date, days: 30, usage: 3.8, monthlyPace: 3.85 }],
      },
    ],
    imports: [],
    rules: [],
    trend: [{ month, spending: "12.50", income: "10000" }],
  };
  await page.route("**/api/v1/household**", async (route) => {
    const request = route.request();
    if (request.url().includes("/csv/") && request.url().endsWith("/templates"))
      return route.fulfill({ json: [] });
    if (request.url().endsWith("/csv/inspect"))
      return route.fulfill({
        status: 201,
        json: {
          config: csvConfig,
          headers: csvConfig.headers,
          samples: [["05.11.2026", "jakdojade.pl", "-4,30"]],
          recordCount: 1,
          ambiguousDate: false,
        },
      });
    if (request.method() === "GET") return route.fulfill({ json: data });
    if (request.url().endsWith("/expenses") && request.method() === "POST") {
      const body = request.postDataJSON();
      data.expenses.push({
        ...expense,
        ...body,
        id: "manual",
        origin: "MANUAL",
      });
      return route.fulfill({ status: 201, json: { id: "manual", ...body } });
    }
    if (request.url().endsWith("/csv/preview"))
      return route.fulfill({
        status: 201,
        json: {
          legacyCount: 0,
          errors: [],
          rows: [
            {
              externalId: "bank-1",
              rowNumber: 2,
              date,
              amount: "4.30",
              incoming: false,
              counterparty: "CITY-NAV",
              title: "Płatność BLIK jakdojade.pl",
              merchant: "Jakdojade",
              categoryId: "transport",
              kind: "EXPENSE",
              skip: false,
              excludedFromBudget: false,
              duplicate: false,
              confidence: "high",
              reason: "Marka lub domena w danych bankowych",
              manualCandidates: [],
            },
          ],
        },
      });
    if (request.url().endsWith("/csv/commit"))
      return route.fulfill({ status: 201, json: { count: 1 } });
    return route.fulfill({ status: 200, json: {} });
  });
});

test("all main screens fit the viewport and do not throw runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of [
    "/",
    "/transactions",
    "/budget",
    "/meters",
    "/more",
    "/import",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText("Ładowanie domowego budżetu…")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("budget excludes internal transfers and loan overpayments, manual expense can be added", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".hero-amount")).toContainText("12,50");
  await expect(page.locator(".hero-bottom")).toContainText(/3\s?987,50/);
  await page
    .getByRole("button", { name: "Dodaj wydatek", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Kwota (zł)", { exact: true }).fill("25.50");
  await page.getByRole("combobox", { name: "Kategoria", exact: true }).click();
  await page.getByRole("option", { name: "Żywność", exact: true }).click();
  await page.getByRole("combobox", { name: "Sklep", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Szukaj: Sklep", exact: true })
    .fill("Piekarnia");
  await page
    .getByRole("option", { name: "Dodaj sklep „Piekarnia”", exact: true })
    .click();
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".hero-amount")).toContainText("38,00");
});

test("CSV import has column mapping, preview and explicit commit", async ({
  page,
}) => {
  await page.goto("/import");
  await page
    .getByRole("combobox", { name: "Konto, z którego pochodzi plik" })
    .click();
  await page.getByRole("option", { name: "ING wspólne", exact: true }).click();
  await page.getByLabel("Plik CSV", { exact: true }).setInputFiles({
    name: "ing.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("test fixture"),
  });
  await page.getByRole("button", { name: "Odczytaj kolumny" }).click();
  await expect(
    page.getByRole("heading", { name: "Dopasuj kolumny" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Kolumna: Data operacji", exact: true }),
  ).toContainText("A — Data");
  await page
    .getByRole("button", { name: "Sprawdź operacje", exact: true })
    .click();
  await expect(page.locator(".raw-bank")).toContainText("CITY-NAV");
  await expect(
    page.getByRole("combobox", { name: "Sklep / odbiorca", exact: true }),
  ).toContainText("Jakdojade");
  await page.getByRole("button", { name: "Zapisz operacje" }).click();
  await expect(
    page.getByRole("heading", { name: "Historia jest już u Was" }),
  ).toBeVisible();
});

test("CSV import scopes templates to the account, maps columns and requires income source and invalid-row acknowledgement", async ({
  page,
}) => {
  const config = {
    ...csvConfig,
    headers: ["Data", "Opis", "Kwota", "Dodatkowy tytuł"],
  };
  let stored: { id: string; name: string; config: CsvConfig }[] = [];
  let submitted:
    | {
        config: CsvConfig;
        skipInvalid: boolean;
        decisions: {
          sourceId: string;
          skip: boolean;
          allowDuplicate: boolean;
        }[];
      }
    | undefined;
  await page.route("**/api/v1/household/csv/**", async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.endsWith("/templates")) {
      if (request.method() === "POST") {
        stored = [{ ...request.postDataJSON(), id: "template-1" }];
        return route.fulfill({ status: 201, json: stored[0] });
      }
      return route.fulfill({ json: stored });
    }
    if (url.endsWith("/inspect"))
      return route.fulfill({
        status: 201,
        json: {
          config,
          headers: config.headers,
          samples: [["05.11.2026", "Pensja", "5000,00", "Wynagrodzenie z CSV"]],
          recordCount: 3,
          ambiguousDate: false,
        },
      });
    if (url.endsWith("/preview"))
      return route.fulfill({
        status: 201,
        json: {
          legacyCount: 0,
          errors: [
            {
              rowNumber: 4,
              message: "Nieprawidłowa data.",
              cells: ["31.02.2026", "Błąd", "10,00"],
            },
          ],
          rows: [
            {
              externalId: "csv:income:1",
              rowNumber: 2,
              syntheticId: true,
              date: "2026-11-05",
              amount: "5000.00",
              incoming: true,
              counterparty: "Pracodawca",
              title: "Pensja",
              merchant: "Pracodawca",
              categoryId: null,
              kind: "INCOME",
              skip: false,
              excludedFromBudget: false,
              duplicate: false,
              confidence: "low",
              reason: "Sprawdź",
              manualCandidates: [],
            },
            {
              externalId: "csv:duplicate:1",
              rowNumber: 3,
              syntheticId: true,
              date: "2026-11-05",
              amount: "5000.00",
              incoming: true,
              counterparty: "Pracodawca",
              title: "Drugi przelew",
              merchant: "Pracodawca",
              categoryId: null,
              kind: "INCOME",
              skip: false,
              excludedFromBudget: false,
              duplicate: true,
              confidence: "low",
              reason: "Sprawdź",
              manualCandidates: [],
            },
          ],
        },
      });
    if (url.endsWith("/commit")) {
      const multipart = request.postData() || "";
      const value = multipart.match(/name="input"\r\n\r\n([^\r]+)/)?.[1];
      submitted = JSON.parse(value || "{}");
      return route.fulfill({ status: 201, json: { count: 2 } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto("/import");
  await page
    .getByRole("combobox", { name: "Konto, z którego pochodzi plik" })
    .click();
  await page.getByRole("option", { name: "ING wspólne", exact: true }).click();
  await page.getByLabel("Plik CSV", { exact: true }).setInputFiles({
    name: "arkusz.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("synthetic CSV"),
  });
  await page.getByRole("button", { name: "Odczytaj kolumny" }).click();
  await page
    .getByRole("combobox", { name: "Kolumna: Tytuł / opis", exact: true })
    .click();
  await page
    .getByRole("option", { name: "D — Dodatkowy tytuł", exact: true })
    .click();
  await page.getByLabel("Nazwa szablonu", { exact: true }).fill("Mój arkusz");
  await page
    .getByRole("button", { name: "Zapisz / zaktualizuj szablon", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Szablon importu", exact: true }),
  ).toContainText("Mój arkusz");
  expect(stored[0]?.config.columns.title).toBe(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Sprawdź operacje", exact: true })
    .click();
  const commit = page.getByRole("button", {
    name: "Zapisz operacje",
    exact: true,
  });
  await expect(commit).toBeDisabled();
  await page
    .getByLabel("To osobna operacja — zapisz mimo podobieństwa")
    .check();
  await page
    .getByRole("combobox", { name: "Źródło dla przychodów", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Wynagrodzenie", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Przypisz źródło", exact: true })
    .click();
  await expect(commit).toBeDisabled();
  await page.getByText("Pokaż błędy", { exact: true }).click();
  await expect(page.getByText("Wiersz 4:", { exact: true })).toBeVisible();
  await page
    .getByLabel("Pomiń 1 błędny wiersz i zapisz tylko poprawne.")
    .check();
  await expect(commit).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await commit.click();
  await expect(
    page.getByRole("heading", { name: "Historia jest już u Was" }),
  ).toBeVisible();
  expect(submitted?.skipInvalid).toBe(true);
  expect(submitted?.config.columns.title).toBe(3);
  expect(submitted?.decisions.map((d) => d.sourceId)).toEqual([
    "salary",
    "salary",
  ]);
  expect(submitted?.decisions[1]).toMatchObject({
    allowDuplicate: true,
    skip: false,
  });
});

test("manifest and app icons are available in the production build", async ({
  request,
}) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.name).toBe("HomeBudget");
  for (const icon of manifest.icons)
    expect((await request.get(icon.src)).ok()).toBeTruthy();
});

test("legacy descriptions are primary, categories are secondary and pastel avatars remain readable", async ({
  page,
}) => {
  await page.goto("/");
  const recent = page
    .locator(".card")
    .filter({ has: page.getByRole("heading", { name: "Ostatnie wydatki" }) });
  await expect(recent.locator(".transaction-title").first()).toHaveText(
    "Zakupy domowe",
  );
  await expect(recent.locator(".row-copy small").first()).toContainText(
    "Żywność",
  );
  await expect(page.locator(".avatar, .sidebar-note")).toHaveCount(0);
  await page.goto("/transactions");
  const first = page.locator(".transaction-row").first();
  await expect(first.locator(".transaction-title")).toHaveText("Zakupy domowe");
  await expect(first.locator(".row-copy small")).toContainText("Żywność");
  await expect(first.locator("time")).toHaveText(/^\d{2}\.\d{2}\.\d{4}$/);
  await expect(page.getByText("Historia sprzed przebudowy")).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    const contrast = await first
      .locator(".merchant-avatar")
      .evaluate((element) => {
        const context = document.createElement("canvas").getContext("2d")!;
        const luminance = (color: string) => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const rgb = Array.from(context.getImageData(0, 0, 1, 1).data)
            .slice(0, 3)
            .map((value) => {
              const channel = value / 255;
              return channel <= 0.04045
                ? channel / 12.92
                : ((channel + 0.055) / 1.055) ** 2.4;
            });
          return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
        };
        const style = getComputedStyle(element);
        const values = [
          luminance(style.color),
          luminance(style.backgroundColor),
        ].sort((a, b) => b - a);
        return (values[0]! + 0.05) / (values[1]! + 0.05);
      });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
});

test("custom choices support Polish search, keyboard selection and mobile sheets", async ({
  page,
  isMobile,
}) => {
  await page.goto("/transactions");
  await page.getByRole("combobox", { name: "Filtr kategorii" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Filtr kategorii",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  if (isMobile) {
    const box = await dialog.boundingBox();
    expect(
      Math.abs(box!.y + box!.height - page.viewportSize()!.height),
    ).toBeLessThanOrEqual(2);
  }
  const search = page.getByRole("searchbox", {
    name: "Szukaj: Filtr kategorii",
  });
  await search.fill("zywnosc");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await search.press("ArrowDown");
  await page
    .getByRole("option", { name: "Żywność", exact: true })
    .press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Filtr kategorii" }),
  ).toHaveText("Żywność");
  await expect(page.locator("select")).toHaveCount(0);
});

test("choices inside an editor close independently and required selections block saving", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Dodaj wydatek", exact: true })
    .click();
  await page.getByLabel("Kwota (zł)", { exact: true }).fill("15");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Kategoria", exact: true });
  await expect(picker).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(2);
  await picker.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByRole("combobox", { name: "Kategoria", exact: true }),
  ).toBeFocused();
  await page.getByRole("combobox", { name: "Kategoria", exact: true }).click();
  await page.getByRole("option", { name: "Żywność", exact: true }).click();
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("custom calendar handles leap days, keyboard navigation and invalid dates inside the editor", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/transactions");
  await page.locator(".transaction-row").first().click();
  const date = page.getByRole("textbox", { name: "Data", exact: true });
  await date.fill("2024-02-29");
  await expect(date).toHaveValue("29.02.2024");
  await page
    .getByRole("button", { name: "Otwórz kalendarz: Data", exact: true })
    .click();
  const calendar = page.getByRole("dialog", {
    name: "Kalendarz: Data",
    exact: true,
  });
  await expect(calendar).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(2);
  await expect(calendar.getByRole("columnheader").first()).toHaveAttribute(
    "aria-label",
    "poniedziałek",
  );
  const leapDay = calendar.getByRole("gridcell", {
    name: "29 lutego 2024",
    exact: true,
  });
  await expect(leapDay).toHaveAttribute("aria-selected", "true");
  if (isMobile) {
    const box = await calendar.boundingBox();
    expect(
      Math.abs(box!.y + box!.height - page.viewportSize()!.height),
    ).toBeLessThanOrEqual(2);
  }
  await leapDay.press("ArrowRight");
  const march = calendar.getByRole("gridcell", {
    name: "1 marca 2024",
    exact: true,
  });
  await expect(march).toBeFocused();
  await march.press("Enter");
  await expect(calendar).not.toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(date).toHaveValue("01.03.2024");
  await date.fill("31.02.2024");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(calendar).toBeVisible();
  await calendar.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(date).toBeFocused();
  await expect(date).toHaveAttribute("aria-invalid", "true");
  await date.fill("29.02.2024");
  const request = page.waitForRequest(
    (request) =>
      request.method() === "PUT" && request.url().endsWith("/expenses/e1"),
  );
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  expect((await request).postDataJSON().date).toBe("2024-02-29");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("month menu uses the custom month and year grids in dark mode", async ({
  page,
}) => {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Włącz ciemny wygląd" }).click();
  await page
    .getByRole("button", { name: "Wybierz miesiąc", exact: true })
    .click();
  const calendar = page.getByRole("dialog", {
    name: "Kalendarz: Wybierz miesiąc",
    exact: true,
  });
  await expect(calendar).toBeVisible();
  await page.getByRole("button", { name: "Wybierz rok", exact: true }).click();
  await calendar.getByRole("gridcell", { name: "2024", exact: true }).click();
  const request = page.waitForRequest(
    (request) =>
      request.method() === "GET" && request.url().includes("month=2024-07"),
  );
  await calendar
    .getByRole("gridcell", { name: "lipiec 2024", exact: true })
    .click();
  await request;
  await expect(calendar).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Wybierz miesiąc", exact: true }),
  ).toHaveText("lipiec 2024");
  await expect(
    page.locator('input[type="date"], input[type="month"]'),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("month, income tab and transaction filters survive reload and the add action matches the current view", async ({
  page,
  isMobile,
}) => {
  await page.goto("/transactions");
  await page
    .getByRole("button", { name: "Poprzedni miesiąc", exact: true })
    .click();
  const monthLabel = (await page
    .getByRole("button", { name: "Wybierz miesiąc", exact: true })
    .textContent())!.trim();
  await page.getByRole("button", { name: "Przychody", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Szukaj transakcji" })
    .fill("Wynagrodzenie");
  await page
    .getByRole("combobox", { name: "Sortowanie transakcji", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Kwota: od największej", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Wybierz miesiąc", exact: true }),
  ).toHaveText(monthLabel);
  await expect(
    page.getByRole("button", { name: "Przychody", exact: true }),
  ).toHaveClass(/active/);
  await expect(
    page.getByRole("searchbox", { name: "Szukaj transakcji" }),
  ).toHaveValue("Wynagrodzenie");
  await expect(
    page.getByRole("combobox", { name: "Sortowanie transakcji", exact: true }),
  ).toContainText("Kwota: od największej");
  await expect(page.locator(".page-heading .quick-add")).toHaveText(
    "Dodaj wydatek",
  );
  if (isMobile) {
    const group = page.getByRole("group", { name: "Rodzaj transakcji" });
    expect(
      await group.evaluate((node) => node.getBoundingClientRect().width),
    ).toBeCloseTo(
      await group.evaluate(
        (node) => node.parentElement!.getBoundingClientRect().width,
      ),
      0,
    );
    const picker = page.locator(".month-picker");
    expect(
      await picker.evaluate((node) => node.getBoundingClientRect().width),
    ).toBeCloseTo(
      await page
        .locator(".page-stack")
        .evaluate((node) => node.getBoundingClientRect().width),
      0,
    );
  }
  await page
    .getByRole("button", { name: "Dodaj przychód", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Dodaj: przychód", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zamknij", exact: true }).click();
  for (const path of ["/budget", "/meters", "/recurring"]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "Wybierz miesiąc", exact: true }),
    ).toHaveText(monthLabel);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Wybierz miesiąc", exact: true }),
    ).toHaveText(monthLabel);
  }
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Wybierz miesiąc", exact: true }),
  ).toHaveText(monthLabel);
  await expect(
    page.getByRole("button", { name: "Dodaj wydatek", exact: true }),
  ).toBeVisible();
  if (isMobile)
    expect(await page.locator(".quick-add span").isVisible()).toBe(true);
});

test("CSV category selection fills all unassigned recipient rows, preserves prior decisions and skips own transfers", async ({
  page,
}) => {
  const base = {
    date: "2026-11-05",
    amount: "4.30",
    incoming: false,
    counterparty: "CITY-NAV",
    title: "Bilet",
    merchant: "Jakdojade",
    categoryId: null as string | null,
    kind: "EXPENSE",
    skip: false,
    excludedFromBudget: false,
    duplicate: false,
    confidence: "high",
    reason: "Marka",
    manualCandidates: [],
  };
  const rows = [
    ...Array.from({ length: 45 }, (_, i) => ({
      ...base,
      externalId: `ticket-${i}`,
      rowNumber: i + 2,
    })),
    { ...base, externalId: "assigned", categoryId: "food" },
    {
      ...base,
      externalId: "other",
      counterparty: "PayPro",
      merchant: "PKP Intercity",
    },
    { ...base, externalId: "skipped", skip: true },
    { ...base, externalId: "duplicate", duplicate: true },
    {
      ...base,
      externalId: "own",
      kind: "TRANSFER",
      skip: true,
      merchant: "Własny rachunek",
    },
  ];
  let submitted:
    | {
        decisions: {
          externalId: string;
          categoryId: string | null;
          skip: boolean;
          merchant: string;
        }[];
      }
    | undefined;
  await page.route("**/api/v1/household/csv/preview", (route) =>
    route.fulfill({ status: 201, json: { rows, errors: [], legacyCount: 0 } }),
  );
  await page.route("**/api/v1/household/csv/commit", (route) => {
    const value = (route.request().postData() || "").match(
      /name="input"\r\n\r\n([^\r]+)/,
    )?.[1];
    submitted = JSON.parse(value || "{}");
    return route.fulfill({ status: 201, json: { count: 46 } });
  });
  await page.goto("/import");
  await page
    .getByRole("combobox", {
      name: "Konto, z którego pochodzi plik",
      exact: true,
    })
    .click();
  await page.getByRole("option", { name: "ING wspólne", exact: true }).click();
  await page.getByLabel("Plik CSV", { exact: true }).setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("synthetic CSV"),
  });
  await page
    .getByRole("button", { name: "Odczytaj kolumny", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sprawdź operacje", exact: true })
    .click();
  const articles = page.locator(".import-row");
  await expect(articles).toHaveCount(40);
  await expect(articles.first()).toContainText(
    "Nazwa do grupowania sklepów w statystykach",
  );
  await articles
    .first()
    .getByRole("combobox", { name: "Sklep / odbiorca", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Szukaj: Sklep / odbiorca", exact: true })
    .fill("Jakdojade — statystyki");
  await page
    .getByRole("option", {
      name: "Dodaj sklep „Jakdojade — statystyki”",
      exact: true,
    })
    .click();
  await articles
    .first()
    .getByRole("combobox", { name: "Kategoria", exact: true })
    .click();
  await page.getByRole("option", { name: "Transport", exact: true }).click();
  await page
    .getByRole("button", { name: "Pokaż kolejne operacje", exact: true })
    .click();
  await expect(articles).toHaveCount(50);
  await expect(
    articles.nth(44).getByRole("combobox", { name: "Kategoria", exact: true }),
  ).toContainText("Transport");
  await expect(
    articles.nth(45).getByRole("combobox", { name: "Kategoria", exact: true }),
  ).toContainText("Żywność");
  await expect(
    articles.nth(46).getByRole("combobox", { name: "Kategoria", exact: true }),
  ).toContainText("Wybierz kategorię");
  await articles
    .nth(46)
    .getByRole("combobox", { name: "Rodzaj operacji", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Przelew własny / gotówka", exact: true })
    .click();
  await expect(
    articles
      .nth(46)
      .getByRole("checkbox", { name: "Pomiń przelew własny", exact: true }),
  ).toBeChecked();
  await expect(
    articles
      .nth(49)
      .getByRole("checkbox", { name: "Pomiń przelew własny", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Zapisz operacje", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Historia jest już u Was" }),
  ).toBeVisible();
  expect(
    submitted?.decisions
      .slice(0, 45)
      .every((d) => d.categoryId === "transport"),
  ).toBe(true);
  expect(submitted?.decisions[0]?.merchant).toBe("Jakdojade — statystyki");
  expect(submitted?.decisions[45]?.categoryId).toBe("food");
  expect(submitted?.decisions.slice(46).every((d) => d.skip)).toBe(true);
  expect(submitted?.decisions.slice(46).every((d) => !d.categoryId)).toBe(true);
});

test("expense editor is compact, ordered and uses the global merchant catalog on Start and Transactions", async ({
  page,
}) => {
  await page.goto("/transactions");
  await page
    .getByRole("button", { name: "Dodaj wydatek", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Dodaj: wydatek",
    exact: true,
  });
  await expect(
    dialog.locator("form > label.field > span:first-child"),
  ).toHaveText(["Kwota (zł)", "Kategoria", "Opis", "Data", "Sklep"]);
  await expect(
    dialog.getByRole("textbox", { name: "Opis", exact: true }),
  ).toHaveAttribute("rows", "2");
  await expect(dialog.getByText(/Szybki wpis ręczny/)).toHaveCount(0);
  await expect(
    dialog.getByRole("combobox", { name: "Rodzaj operacji", exact: true }),
  ).not.toBeVisible();
  await dialog
    .getByRole("spinbutton", { name: "Kwota (zł)", exact: true })
    .fill("25.50");
  await dialog
    .getByRole("combobox", { name: "Kategoria", exact: true })
    .click();
  await page.getByRole("option", { name: "Żywność", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Sklep", exact: true }).click();
  await page.getByRole("option", { name: "Lidl", exact: true }).click();
  const saved = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/expenses"),
  );
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  expect((await saved).postDataJSON()).toMatchObject({
    merchantId: "lidl",
    merchant: "Lidl",
    kind: "EXPENSE",
  });
  await page.goto("/more");
  await page
    .getByRole("button", { name: "Edytuj sklep: Lidl", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "także w poprzednich miesiącach",
  );
  await page.getByRole("button", { name: "Zamknij", exact: true }).click();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Dodaj wydatek", exact: true }),
  ).toBeVisible();
});

test("merchant catalog merges into an existing store and confirms deletion of used stores", async ({
  page,
}) => {
  await page.goto("/more");
  await expect(
    page.getByRole("button", { name: "Edytuj sklep: Lidl", exact: true }),
  ).toBeVisible();
  const data = await page.evaluate(async () =>
    (await fetch("/api/v1/household?month=2026-11")).json(),
  );
  data.merchants.push({
    id: "duplicate",
    name: "Lidl — duplikat",
    _count: { expenses: 1, aliases: 1, rules: 1 },
  });
  let failMerge = true;
  const writes: { method: string; path: string; body?: unknown }[] = [];
  await page.route("**/api/v1/household**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") return route.fulfill({ json: data });
    writes.push({
      method: request.method(),
      path,
      body: request.method() === "POST" ? request.postDataJSON() : undefined,
    });
    if (path.endsWith("/merchants/duplicate/merge")) {
      if (failMerge)
        return route.fulfill({
          status: 409,
          json: { message: "Sklep został zmieniony. Spróbuj ponownie." },
        });
      data.merchants = data.merchants.filter(
        (m: { id: string }) => m.id !== "duplicate",
      );
      return route.fulfill({ status: 201, json: data.merchants[0] });
    }
    if (request.method() === "DELETE" && path.endsWith("/merchants/lidl")) {
      data.merchants = [];
      return route.fulfill({ json: { id: "lidl" } });
    }
    return route.fallback();
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Scal sklep: Lidl — duplikat", exact: true })
    .click();
  const merge = page.getByRole("dialog", { name: "Scal sklepy", exact: true });
  await expect(
    merge.getByRole("button", { name: "Scal sklepy", exact: true }),
  ).toBeDisabled();
  await merge
    .getByRole("combobox", { name: "Sklep docelowy", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Lidl — duplikat", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: "Lidl", exact: true }).click();
  expect(
    await merge.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
  ).toBe(true);
  await merge.getByRole("button", { name: "Scal sklepy", exact: true }).click();
  await expect(merge.getByRole("alert")).toHaveText(
    "Sklep został zmieniony. Spróbuj ponownie.",
  );
  failMerge = false;
  await merge.getByRole("button", { name: "Scal sklepy", exact: true }).click();
  await expect(merge).not.toBeVisible();
  expect(writes.at(-1)).toMatchObject({
    method: "POST",
    path: "/api/v1/household/merchants/duplicate/merge",
    body: { targetId: "lidl" },
  });
  await expect(
    page.getByRole("button", {
      name: "Scal sklep: Lidl — duplikat",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Scal sklep: Lidl", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Usuń sklep: Lidl", exact: true })
    .click();
  const deletion = page.getByRole("dialog", {
    name: "Usuń sklep",
    exact: true,
  });
  await expect(deletion).toContainText(
    "Transakcje pozostaną z dotychczasowymi kwotami i kategoriami",
  );
  expect(
    await deletion.evaluate(
      (dialog) => dialog.scrollWidth <= dialog.clientWidth,
    ),
  ).toBe(true);
  await deletion.getByRole("button", { name: "Anuluj", exact: true }).click();
  expect(writes.filter((w) => w.method === "DELETE")).toHaveLength(0);
  await page
    .getByRole("button", { name: "Usuń sklep: Lidl", exact: true })
    .click();
  await deletion
    .getByRole("button", { name: "Usuń sklep", exact: true })
    .click();
  await expect(deletion).not.toBeVisible();
  expect(writes.at(-1)).toMatchObject({
    method: "DELETE",
    path: "/api/v1/household/merchants/lidl",
  });
  await expect(
    page.getByRole("button", { name: "Usuń sklep: Lidl", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
