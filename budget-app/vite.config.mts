import { defineConfig } from "vite";
import Vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    {
      name: "demo-search-metadata",
      transformIndexHtml(html) {
        return process.env.VITE_DEMO_MODE === "true"
          ? html.replace(
              "<head>",
              '<head><meta name="robots" content="noindex,nofollow">',
            )
          : html;
      },
    },
    Vue(),
    VitePWA({
      disable: process.env.VITE_DEMO_MODE === "true",
      registerType: "prompt",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "HomeBudget",
        short_name: "HomeBudget",
        lang: "pl",
        description: "Wspólny budżet, wydatki i liczniki Waszego domu.",
        theme_color: "#286c68",
        background_color: "#f3f5f7",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
        // Financial data always comes from the server; it is never stored in Cache Storage.
        runtimeCaching: [{ urlPattern: /\/api\//, handler: "NetworkOnly" }],
      },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 8080,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
