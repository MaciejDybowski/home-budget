#!/usr/bin/env node
// Run only against a disposable named test database, never a real household.
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const requireBackend = createRequire(resolve(root, 'budget-app-backend/package.json'));
const requireFrontend = createRequire(resolve(root, 'budget-app/package.json'));
const { chromium, expect } = requireFrontend('@playwright/test');
const { Pool } = requireBackend('pg');
const url = process.env.TEST_DATABASE_URL;
if (!url || !['/budget_test', '/budget_integration'].includes(new URL(url).pathname)) {
  throw new Error('TEST_DATABASE_URL must point to an isolated budget_test or budget_integration database.');
}
cpSync(resolve(root, 'budget-app/dist'), resolve(root, 'budget-app-backend/public'), { recursive: true });
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(done => reservation.close(done));
const origin = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString('hex');
const pool = new Pool({ connectionString: url });
try { await pool.query('DELETE FROM "AuthSession"'); await pool.query('DELETE FROM "AuthAccount"'); }
finally { await pool.end(); }
let child, exited, browser;
async function start() {
  child = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve(root, 'budget-app-backend'),
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url,
      SERVE_FRONTEND: 'true', AUTH_MODE: 'local',
      APP_ORIGIN: origin, AUTH_COOKIE_SECURE: 'false',
      HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  exited = once(child, 'exit');
  await new Promise((done, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Backend startup timeout')), 45000);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('Nest application successfully started')) { clearTimeout(timeout); done(); }
    });
    child.stderr.on('data', () => {}); // Never echo credentials from a failed environment.
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Backend exited before startup')); });
  });
  // Nest logs initialization before the listening socket is necessarily bound.
  await expect.poll(async () => {
    try { return (await fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(2000) })).status; }
    catch { return 0; }
  }, { timeout: 15000 }).toBe(200);
}
async function stop() {
  if (child && child.exitCode === null) { child.kill('SIGTERM'); await exited; }
}
try {
  await start();
  assert.equal((await fetch(origin + '/api/v1/household')).status, 401);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'pl-PL', viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/transactions', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: 'Utwórz dostęp', exact: true })).toBeVisible();
  await page.getByLabel('Login', { exact: true }).fill('family');
  await page.getByLabel('Hasło', { exact: true }).fill(password);
  await page.getByLabel('Powtórz hasło', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Utwórz dostęp', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Transakcje', exact: true })).toBeVisible();
  assert.ok(!(await page.evaluate(() => document.cookie)).includes('hb_session'));
  await stop();
  await start();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Transakcje', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Wyloguj', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zaloguj', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zaloguj', exact: true })).toBeEnabled();
  const denied = await page.request.get(origin + '/api/v1/household');
  assert.equal(denied.status(), 401);
  assert.equal(errors.length, 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log('Real browser + backend + PostgreSQL: login, HttpOnly cookie, deep link, server restart, logout, protected API and desktop/mobile layout OK.');
} finally {
  await browser?.close();
  await stop();
}
