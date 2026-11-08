import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { englishSite } from "./scripts/site-language.mjs";

export default defineConfig({
  root: fileURLToPath(new URL("./site", import.meta.url)),
  publicDir: fileURLToPath(new URL("./site/public", import.meta.url)),
  build: {
    outDir: "../dist-site",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        pl: fileURLToPath(new URL("./site/index.html", import.meta.url)),
        en: fileURLToPath(new URL("./site/en/index.html", import.meta.url)),
      },
    },
  },
  plugins: [
    {
      name: "site-metadata-and-font-notices",
      transformIndexHtml: {
        order: "pre",
        handler(html, context) {
          if (context.path.startsWith("/en/"))
            html = englishSite(
              readFileSync(
                fileURLToPath(new URL("./site/index.html", import.meta.url)),
                "utf8",
              ),
            );
          const url =
            process.env.VITE_SITE_URL ||
            "https://maciejdybowski.github.io/home-budget/";
          return html.replaceAll("__SITE_URL__", url.replace(/\/+$/, "") + "/");
        },
      },
      generateBundle() {
        const licenses = ["dm-sans", "manrope"].map((font) =>
          readFileSync(
            fileURLToPath(
              new URL(
                `./node_modules/@fontsource-variable/${font}/LICENSE`,
                import.meta.url,
              ),
            ),
            "utf8",
          ),
        );
        this.emitFile({
          type: "asset",
          fileName: "fonts-LICENSE.txt",
          source: licenses.join("\n\n"),
        });
        this.emitFile({
          type: "asset",
          fileName: "robots.txt",
          source: "User-agent: *\nAllow: /\n",
        });
      },
    },
  ],
});
