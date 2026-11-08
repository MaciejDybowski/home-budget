import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.PAGES_BASE || "/home-budget/";
const demo = `${base}demo/`;
test.use({ locale: "pl-PL" });

test("presentation is responsive, keyboard accessible and links to a working sandbox", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}?lang=pl`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Wspólny dom.Jasny plan.",
  );
  await page.getByRole("button", { name: "Rok", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rok", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-income]")).toContainText("129");
  await page.getByRole("button", { name: "Miesiąc", exact: true }).click();
  const preview = page.locator(".product-window img");
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveJSProperty("complete", true);
  await expect
    .poll(() =>
      preview.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Kopiuj polecenie instalacji" })
    .click();
  await expect(page.getByRole("status")).toContainText(/Skopiowano|Zaznaczono/);
  const faq = page.locator("details").first();
  await faq.locator("summary").click();
  await expect(faq).toHaveAttribute("open", "");
  await expect(faq).toContainText("MIT");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath("presentation.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Otwórz demo", exact: true }).click();
  await expect(page.locator(".dashboard-grid")).toBeVisible();
  await expect(page.locator(".demo-notice")).toContainText("Fikcyjne dane");
  await page.getByRole("link", { name: "O aplikacji", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("demo works without API, saves an expense locally and survives hash-route refresh", async ({
  page,
}) => {
  const apiCalls: string[] = [],
    errors: string[] = [],
    failures: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) apiCalls.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  await page.goto(demo);
  await expect(page.locator(".dashboard-grid")).toBeVisible();
  await page
    .getByRole("button", { name: "Dodaj wydatek", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Dodaj: wydatek",
    exact: true,
  });
  await editor
    .getByRole("spinbutton", { name: "Kwota (zł)", exact: true })
    .fill("12.34");
  await editor
    .getByRole("textbox", { name: "Opis", exact: true })
    .fill("Próba publicznego demo");
  await editor
    .getByRole("combobox", { name: "Kategoria", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Zakupy spożywcze", exact: true })
    .click();
  await editor.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(editor).not.toBeVisible();
  for (const route of [
    "transactions",
    "budget",
    "meters",
    "recurring",
    "analytics",
    "import",
    "more",
  ]) {
    await page.goto(`${demo}#/${route}`);
    await expect(page.locator(".page-stack")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto(`${demo}#/transactions`);
  await page.reload();
  await expect(
    page.getByText("Próba publicznego demo", { exact: true }),
  ).toBeVisible();
  await page.goto(`${demo}#/analytics`);
  await page
    .getByRole("combobox", { name: "Kategoria analizy", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Zakupy spożywcze", exact: true })
    .click();
  await expect(page.locator(".category-analysis")).toBeVisible();
  await expect(
    page.getByText("Próba publicznego demo", { exact: true }),
  ).toBeVisible();
  expect(apiCalls).toEqual([]);
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});

test("demo merchant merge and deletion preserve expenses; reset restores the sandbox", async ({
  page,
}) => {
  await page.goto(`${demo}#/more`);
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("homebudget.public-demo.v1") || "null"),
  );
  // Initial seed is not persisted until the first financial action.
  await page
    .getByRole("button", { name: "Scal sklep: Miejska Kawa", exact: true })
    .click();
  const merge = page.getByRole("dialog", { name: "Scal sklepy", exact: true });
  await merge
    .getByRole("combobox", { name: "Sklep docelowy", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Zielony Market", exact: true })
    .click();
  await merge.getByRole("button", { name: "Scal sklepy", exact: true }).click();
  await expect(merge).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Scal sklep: Miejska Kawa", exact: true }),
  ).toHaveCount(0);
  const merged = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("homebudget.public-demo.v1")!),
  );
  expect(
    merged.expenses.some(
      (row: { merchantId: string }) => row.merchantId === "shop-3",
    ),
  ).toBe(false);
  const total = merged.expenses.reduce(
    (sum: number, row: { amount: string }) =>
      sum + Math.round(Number(row.amount) * 100),
    0,
  );
  await page
    .getByRole("button", { name: "Usuń sklep: Zielony Market", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Usuń sklep", exact: true })
    .getByRole("button", { name: "Usuń sklep", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Usuń sklep: Zielony Market",
      exact: true,
    }),
  ).toHaveCount(0);
  const deleted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("homebudget.public-demo.v1")!),
  );
  expect(deleted.expenses.length).toBe(merged.expenses.length);
  expect(
    deleted.expenses.reduce(
      (sum: number, row: { amount: string }) =>
        sum + Math.round(Number(row.amount) * 100),
      0,
    ),
  ).toBe(total);
  if (before) expect(deleted.expenses.length).toBe(before.expenses.length);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Resetuj demo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Scal sklep: Miejska Kawa", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Usuń sklep: Zielony Market",
      exact: true,
    }),
  ).toBeVisible();
});

test("example import is explicit, duplicate-safe and can be undone", async ({
  page,
}) => {
  await page.goto(`${demo}#/import`);
  await expect(
    page.getByText("To symulacja importu.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Zaimportuj 3 przykłady", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Zaimportowano 3");
  await page
    .getByRole("button", { name: "Zaimportuj 3 przykłady", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Nie dodano duplikatów");
  await page.goto(`${demo}#/more`);
  await expect(
    page.getByText("przykladowe-zakupy.csv", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Wycofaj", exact: true }).click();
  await expect(
    page.getByText("przykladowe-zakupy.csv", { exact: true }),
  ).toHaveCount(0);
});

test("budget planning creates no expenses and a bill requires an explicit financial action", async ({
  page,
}) => {
  await page.goto(`${demo}#/budget`);
  await page
    .getByRole("spinbutton", {
      name: "Łączny limit zwykłych wydatków (zł)",
      exact: true,
    })
    .fill("9000");
  await page
    .getByRole("button", { name: "Zapisz plan miesiąca", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Zapisano plan");
  const initial = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("homebudget.public-demo.v1")!),
  );
  await page.reload();
  await expect(
    page.getByRole("spinbutton", {
      name: "Łączny limit zwykłych wydatków (zł)",
      exact: true,
    }),
  ).toHaveValue("9000");
  await page.goto(`${demo}#/recurring`);
  const bill = page
    .locator(".schedule-row")
    .filter({ hasText: "Internet domowy" });
  await bill.getByRole("button", { name: "Dodaj koszt", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Dodaj: wydatek",
    exact: true,
  });
  await editor.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(
    bill.getByRole("button", { name: "Odłącz", exact: true }),
  ).toBeVisible();
  const recorded = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("homebudget.public-demo.v1")!),
  );
  expect(recorded.expenses.length).toBe(initial.expenses.length + 1);
  expect(
    recorded.payments.some(
      (row: { chargeId: string }) => row.chargeId === "charge-internet",
    ),
  ).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await bill.getByRole("button", { name: "Odłącz", exact: true }).click();
  await expect(
    bill.getByRole("button", { name: "Dodaj koszt", exact: true }),
  ).toBeVisible();
  const unlinked = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("homebudget.public-demo.v1")!),
  );
  expect(unlinked.expenses.length).toBe(recorded.expenses.length);
});
