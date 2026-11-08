import { defineConfig } from "@playwright/test";

const base = process.env.PAGES_BASE || "/home-budget/";
export default defineConfig({
  testDir: "./tests-pages",
  fullyParallel: true,
  workers: process.env.CI ? 3 : 3,
  use: {
    locale: 'pl-PL',
    baseURL: `http://127.0.0.1:4181${base}`,
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "iphone-13-mini",
      use: {
        browserName: "webkit",
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "iphone-17",
      use: {
        browserName: "webkit",
        viewport: { width: 402, height: 874 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run build:pages && node scripts/serve-pages.mjs",
    url: `http://127.0.0.1:4181${base}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
