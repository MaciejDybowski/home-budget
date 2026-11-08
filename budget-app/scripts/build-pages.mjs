import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { createServer } from "node:http";
import { readFileSync as readSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = process.env.PAGES_BASE || "/home-budget/";
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))
  throw new Error("PAGES_BASE must be an absolute directory path ending in /.");
const npm = (args, extra = {}) =>
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extra },
  });
npm(["run", "type-check"]);
npm(["run", "build:demo", "--", "--base", `${base}demo/`]);
const media = new URL("../site/public/media/", import.meta.url);
mkdirSync(media, { recursive: true });
cpSync(
  new URL("../../docs/screenshots/home-desktop.png", import.meta.url),
  new URL("home-desktop.png", media),
);
const demoRoot = resolve(
  fileURLToPath(new URL("../dist-demo/", import.meta.url)),
);
const demoPrefix = `${base}demo/`;
const extensions = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};
const server = createServer((request, response) => {
  const pathname = decodeURI(
    new URL(request.url || "/", "http://localhost").pathname,
  );
  if (!pathname.startsWith(demoPrefix)) {
    response.writeHead(404).end();
    return;
  }
  const relative = pathname.slice(demoPrefix.length) || "index.html";
  const path = resolve(demoRoot, relative);
  if (path !== demoRoot && !path.startsWith(demoRoot + sep)) {
    response.writeHead(404).end();
    return;
  }
  try {
    response
      .writeHead(200, {
        "Content-Type": extensions[extname(path)] || "application/octet-stream",
        "Cache-Control": "no-store",
      })
      .end(readSync(path));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
try {
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Demo screenshot server failed to start.");
  const browser = await chromium.launch();
  try {
    for (const language of ["pl", "en"]) {
      const context = await browser.newContext({
        locale: language === "pl" ? "pl-PL" : "en-GB",
        viewport: { width: 1440, height: 1000 },
        serviceWorkers: "block",
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const requests = [];
      page.on("request", (item) => {
        if (item.url().includes("/api/")) requests.push(item.url());
      });
      await page.goto(
        `http://127.0.0.1:${address.port}${demoPrefix}?lang=${language}`,
      );
      await page.locator(".dashboard-grid").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: fileURLToPath(
          new URL(`home-desktop-${language === "pl" ? "pl" : "en"}.png`, media),
        ),
      });
      if (requests.length)
        throw new Error("The browser demo unexpectedly made an API request.");
      await context.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
cpSync(
  new URL("home-desktop-pl.png", media),
  new URL("../../docs/screenshots/home-desktop.png", import.meta.url),
);
cpSync(
  new URL("home-desktop-pl.png", media),
  new URL("home-desktop.png", media),
);
cpSync(
  new URL("home-desktop-en.png", media),
  new URL("../../docs/screenshots/home-desktop-en.png", import.meta.url),
);
npm(["run", "build:site", "--", "--base", base]);
rmSync(new URL("../site/public/", import.meta.url), {
  recursive: true,
  force: true,
});
rmSync(new URL("../dist-pages/", import.meta.url), {
  recursive: true,
  force: true,
});
mkdirSync(new URL("../dist-pages/", import.meta.url));
cpSync(
  new URL("../dist-site/", import.meta.url),
  new URL("../dist-pages/", import.meta.url),
  { recursive: true },
);
cpSync(
  new URL("../dist-demo/", import.meta.url),
  new URL("../dist-pages/demo/", import.meta.url),
  { recursive: true },
);
writeFileSync(new URL("../dist-pages/.nojekyll", import.meta.url), "");
// A self-contained social image: no external font/CDN or private screenshots.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#f3f7f8"/><rect x="75" y="68" width="56" height="60" rx="18" fill="#28776c"/><path d="m87 94 16-13 16 13v21h-11v-14H98v14H87z" fill="none" stroke="#fff" stroke-width="2"/><text x="150" y="110" font-family="Arial" font-size="30" font-weight="bold" fill="#173447">HomeBudget.</text><text x="75" y="280" font-family="Arial" font-size="86" font-weight="bold" fill="#173447">Wspólny dom.</text><text x="75" y="380" font-family="Arial" font-size="86" font-weight="bold" fill="#28776c">Jasny plan.</text><text x="78" y="462" font-family="Arial" font-size="27" fill="#617887">Wydatki, rachunki i cele. Na Waszych zasadach.</text><rect x="75" y="522" width="1050" height="1" fill="#dce6e9"/><text x="78" y="575" font-family="Arial" font-size="19" fill="#617887">Interaktywne demo · Docker · Otwarty kod · MIT</text></svg>`;
const rendered = new Resvg(svg, { font: { loadSystemFonts: true } }).render();
writeFileSync(
  new URL("../dist-pages/social-preview.png", import.meta.url),
  rendered.asPng(),
);
const license = readFileSync(new URL("../../LICENSE", import.meta.url));
const englishSvg = svg
  .replace("Wspólny dom.", "One household.")
  .replace("Jasny plan.", "One clear plan.")
  .replace(
    "Wydatki, rachunki i cele. Na Waszych zasadach.",
    "Your spending, bills and goals. On your terms.",
  )
  .replace(
    "Interaktywne demo · Docker · Otwarty kod · MIT",
    "Live demo · Docker · Open source · MIT",
  );
writeFileSync(
  new URL("../dist-pages/social-preview-en.png", import.meta.url),
  new Resvg(englishSvg, { font: { loadSystemFonts: true } }).render().asPng(),
);
writeFileSync(new URL("../dist-pages/LICENSE", import.meta.url), license);
console.log(
  `GitHub Pages ready at dist-pages/ (base ${base}, browser-only demo).`,
);
