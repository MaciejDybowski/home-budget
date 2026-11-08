import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist-pages/", import.meta.url)));
const base = process.env.PAGES_BASE || "/home-budget/";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/" && base !== "/") {
      response.writeHead(302, { Location: base });
      response.end();
      return;
    }
    if (!url.pathname.startsWith(base)) throw new Error("Not found");
    let file = resolve(
      root,
      "." + sep + decodeURIComponent(url.pathname.slice(base.length)),
    );
    if (file !== root && !file.startsWith(root + sep)) throw new Error("Not found");
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    const content = await readFile(file);
    response.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
server.listen(Number(process.env.PORT || 4181), "127.0.0.1", () =>
  console.log(
    `Pages preview: http://127.0.0.1:${process.env.PORT || 4181}${base}`,
  ),
);
