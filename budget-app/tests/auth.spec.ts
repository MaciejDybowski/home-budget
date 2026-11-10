import { test, expect } from "@playwright/test";

test("logout failure keeps the budget hidden and retry refreshes rotated CSRF without restoring the UI", async ({
  page,
}) => {
  let signedIn = true;
  let logoutCalls = 0;
  let statusCalls = 0;
  await page.route("**/api/v1/auth/status", (route) => {
    statusCalls++;
    return route.fulfill({
      json: {
        enabled: true,
        authenticated: signedIn,
        csrfToken: String(statusCalls % 10).repeat(64),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    });
  });
  await page.route("**/api/v1/auth/logout", (route) => {
    logoutCalls++;
    expect(route.request().headers()["x-csrf-token"]).toBe(
      String(statusCalls % 10).repeat(64),
    );
    if (logoutCalls === 1) return route.fulfill({ status: 503, json: {} });
    signedIn = false;
    return route.fulfill({
      json: { enabled: true, authenticated: false, csrfToken: "a".repeat(64) },
    });
  });
  await page.route("**/api/v1/household**", (route) =>
    route.fulfill({
      json: {
        categories: [],
        sources: [],
        expenses: [],
        incomes: [],
        previousExpenses: [],
        accounts: [],
        budget: null,
        goals: [],
        meters: [],
        imports: [],
        rules: [],
        merchants: [],
        trend: [],
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Nasz miesiąc", exact: true }),
  ).toBeVisible();
  await page.locator(".profile-avatar").click();
  await page.getByRole("menuitem", { name: "Wyloguj", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ponów wylogowanie" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nasz miesiąc", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Ponów wylogowanie" }).click();
  await expect(
    page.getByRole("button", { name: "Ponów wylogowanie" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Zaloguj", exact: true }),
  ).toBeVisible();
  expect(logoutCalls).toBe(2);
  expect(signedIn).toBe(false);
});

test("requires login before loading finance data, supports PL/EN, logout and a retained deep link", async ({
  page,
}) => {
  let signedIn = false;
  let reads = 0;
  let writes = 0;
  const csrf = "a".repeat(64);
  const status = () => ({
    enabled: true,
    authenticated: signedIn,
    csrfToken: csrf,
    expiresAt: signedIn
      ? new Date(Date.now() + 86400000).toISOString()
      : undefined,
  });
  await page.route("**/api/v1/auth/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/login")) {
      expect(route.request().headers()["x-csrf-token"]).toBe(csrf);
      const input = route.request().postDataJSON();
      if (input.password !== "test-password")
        return route.fulfill({
          status: 401,
          json: { message: "Nieprawidłowy login lub hasło." },
        });
      signedIn = true;
    }
    if (url.pathname.endsWith("/logout")) signedIn = false;
    await route.fulfill({ json: status() });
  });
  await page.route("**/api/v1/household**", async (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.fulfill({ status: 201, json: {} });
    }
    reads++;
    await route.fulfill({
      json: {
        categories: [],
        sources: [],
        expenses: [],
        incomes: [],
        previousExpenses: [],
        accounts: [],
        budget: null,
        goals: [],
        meters: [],
        imports: [],
        rules: [],
        merchants: [],
        trend: [],
      },
    });
  });
  await page.goto("/transactions");
  await expect(
    page.getByRole("button", { name: "Zaloguj", exact: true }),
  ).toBeVisible();
  expect(reads).toBe(0);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "PL", exact: true }).click();
  await page.getByLabel("Login", { exact: true }).fill("family");
  await page.getByLabel("Hasło", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Zaloguj", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Nieprawidłowy login lub hasło.",
  );
  expect(reads).toBe(0);
  await expect(page.getByLabel("Hasło", { exact: true })).toHaveValue("");
  await page.getByLabel("Hasło", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Zaloguj", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Transakcje", exact: true }),
  ).toBeVisible();
  expect(reads).toBeGreaterThan(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Transakcje", exact: true }),
  ).toBeVisible();
  await page.locator(".profile-avatar").click();
  await page.getByRole("menuitem", { name: "Wyloguj", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Zaloguj", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Transakcje", exact: true }),
  ).not.toBeVisible();
  await expect.poll(() => signedIn).toBe(false);
  expect(writes).toBe(0);
});

test("fails closed when the authentication service is unavailable", async ({
  page,
}) => {
  let reads = 0;
  await page.route("**/api/v1/auth/status", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.route("**/api/v1/household**", (route) => {
    reads++;
    return route.fulfill({ json: {} });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Nie można sprawdzić dostępu",
  );
  await expect(
    page.getByRole("button", { name: "Spróbuj ponownie" }),
  ).toBeVisible();
  expect(reads).toBe(0);
});

test("a 401 removes the budget and never replays a mutation", async ({
  page,
}) => {
  let expired = false;
  const csrf = "b".repeat(64);
  await page.route("**/api/v1/auth/status", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        authenticated: true,
        csrfToken: csrf,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/household**", (route) =>
    expired
      ? route.fulfill({ status: 401, json: {} })
      : route.fulfill({
          json: {
            categories: [],
            sources: [],
            expenses: [],
            incomes: [],
            previousExpenses: [],
            accounts: [],
            budget: null,
            goals: [],
            meters: [],
            imports: [],
            rules: [],
            merchants: [],
            trend: [],
          },
        }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Nasz miesiąc", exact: true }),
  ).toBeVisible();
  expired = true;
  await page.getByRole("button", { name: "Odśwież dane" }).click();
  await expect(
    page.getByRole("button", { name: "Zaloguj", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nasz miesiąc", exact: true }),
  ).not.toBeVisible();
});

test("avatar opens profile and allows changing the username and password", async ({
  page,
}) => {
  const csrf = "c".repeat(64);
  let saved: Record<string, string> | undefined;
  await page.route("**/api/v1/auth/status", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        authenticated: true,
        csrfToken: csrf,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/auth/profile", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { username: "family" } });
    expect(route.request().headers()["x-csrf-token"]).toBe(csrf);
    saved = route.request().postDataJSON();
    return route.fulfill({
      json: {
        username: "new-family",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });
  });
  await page.route("**/api/v1/household**", (route) =>
    route.fulfill({
      json: {
        categories: [],
        sources: [],
        expenses: [],
        incomes: [],
        previousExpenses: [],
        accounts: [],
        budget: null,
        goals: [],
        meters: [],
        imports: [],
        rules: [],
        merchants: [],
        trend: [],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Menu profilu" }).click();
  await page.getByRole("menuitem", { name: "Profil" }).click();
  await expect(page.getByLabel("Login", { exact: true })).toHaveValue("family");
  await page.getByLabel("Login", { exact: true }).fill("new-family");
  await page
    .getByLabel("Aktualne hasło", { exact: true })
    .fill("current-password");
  await page
    .getByLabel("Nowe hasło", { exact: true })
    .fill("new-password-long");
  await page
    .getByLabel("Powtórz nowe hasło", { exact: true })
    .fill("new-password-long");
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Zapisano profil i odświeżono sesję.",
  );
  expect(saved).toEqual({
    username: "new-family",
    currentPassword: "current-password",
    newPassword: "new-password-long",
  });
});
