import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.PAGES_BASE || "/home-budget/";
const demo = `${base}demo/`;
test.use({ locale: "en-GB" });

test("website follows the browser language on a first visit", async ({
  page,
}) => {
  await page.goto(base);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveURL(/\/en\/\?lang=en$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Switch to light theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("button", { name: "Switch to dark theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("English presentation has localised content, metadata, links and accessible controls", async ({
  page,
}) => {
  await page.goto(`${base}en/`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(
    (await page.locator("body").innerText())
      .split("\n")
      .filter((line) => /[ąćęłńóśźż]/i.test(line)),
  ).toEqual([]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "One household.One clear plan.",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/en\/$/,
  );
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
    "content",
    "en_GB",
  );
  await expect(
    page.locator('link[rel="alternate"][hreflang="pl"]'),
  ).toHaveAttribute("href", /home-budget\/$/);
  await expect(
    page.locator('link[rel="alternate"][hreflang="en"]'),
  ).toHaveAttribute("href", /home-budget\/en\/$/);
  await expect(
    page.locator('.site-language [aria-current="page"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.site-language [aria-current="page"]'),
  ).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator("[data-income]")).toContainText("129,600.00");
  await expect(page.locator(".product-window img")).toHaveAttribute(
    "alt",
    /HomeBudget dashboard/,
  );
  const image = page.locator(".product-window img");
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveJSProperty("complete", true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations.map((item) => item.id)).toEqual([]);
  await page
    .getByRole("button", { name: "Switch to light theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const lightAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(lightAccessibility.violations.map((item) => item.id)).toEqual([]);
  await page
    .getByRole("button", { name: "Switch to dark theme", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Open demo", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Our month");
  await expect(
    page.getByRole("link", { name: "About HomeBudget", exact: true }),
  ).toHaveAttribute("href", /\.\.\/en\/$/);
  await page
    .getByRole("link", { name: "About HomeBudget", exact: true })
    .click();
  await page.getByRole("link", { name: "Polski", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Wspólny dom.Jasny plan.",
  );
});

test("language changes update every view and keep saved financial data intact", async ({
  page,
}) => {
  const calls: string[] = [],
    errors: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) calls.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${demo}?lang=en`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Our month");
  await page
    .getByRole("button", { name: "Add an expense", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Add expense", exact: true });
  await editor
    .getByRole("spinbutton", { name: "Amount (PLN)", exact: true })
    .fill("12.34");
  await editor
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("My own note stays as written");
  await editor.getByRole("combobox", { name: "Category", exact: true }).click();
  await page.getByRole("option", { name: "Groceries", exact: true }).click();
  await editor.getByRole("combobox", { name: "Store", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search: Store" })
    .fill("My weekend shop");
  await page.getByRole("option", { name: /Add store/ }).click();
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();
  const original = await page.evaluate(() =>
    localStorage.getItem("homebudget.public-demo.v1"),
  );
  for (const [route, heading] of [
    ["transactions", "Transactions"],
    ["budget", "Budget and goals"],
    ["meters", "Meters"],
    ["recurring", "Subscriptions and recurring bills"],
    ["analytics", "Insights"],
    ["import", "CSV import"],
    ["more", "Settings"],
  ]) {
    await page.goto(`${demo}?lang=en#/${route}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading!);
    await expect(page.locator(".page-stack")).toBeVisible();
    expect(
      (await page.locator("main").innerText())
        .split("\n")
        .filter((line) => /[ąćęłńóśźż]/i.test(line)),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "PL", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Ustawienia",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(page.getByText("Green Market", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Zielony Market", { exact: true })).toBeVisible();
  await expect(page.getByText("My weekend shop", { exact: true })).toHaveCount(
    2,
  );
  await page.goto(`${demo}#/transactions`);
  await expect(
    page.getByText("My own note stays as written", { exact: true }),
  ).toBeVisible();
  await page.goto(`${demo}#/more`);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Ustawienia",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("homebudget.public-demo.v1"),
    ),
  ).toBe(original);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  await page.goto(`${demo}#/transactions`);
  await expect(
    page.getByText("My own note stays as written", { exact: true }),
  ).toBeVisible();
  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

test("English dates and validation explain what to do without exposing backend wording", async ({
  page,
}) => {
  await page.goto(`${demo}?lang=en`);
  await page
    .getByRole("button", { name: "Add an expense", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Add expense", exact: true });
  await editor
    .getByRole("spinbutton", { name: "Amount (PLN)", exact: true })
    .fill("0");
  await editor.getByRole("combobox", { name: "Category", exact: true }).click();
  await page.getByRole("option", { name: "Groceries", exact: true }).click();
  await expect(
    editor.getByRole("textbox", { name: "Date", exact: true }),
  ).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor.getByRole("alert")).toHaveText(
    "Enter an amount greater than zero.",
  );
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "PL", exact: true }).click();
  await page
    .getByRole("button", { name: "Dodaj wydatek", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Data", exact: true }),
  ).toHaveValue(/^\d{2}\.\d{2}\.\d{4}$/);
});
