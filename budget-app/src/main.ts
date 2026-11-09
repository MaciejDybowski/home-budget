import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./household/app.css";

// Apply the existing appearance preference before the authentication gate mounts.
document.documentElement.dataset.theme =
  localStorage.getItem("theme") === "dark" ||
  (!localStorage.getItem("theme") &&
    matchMedia("(prefers-color-scheme: dark)").matches)
    ? "dark"
    : "light";
createApp(App).use(router).mount("#app");
if (import.meta.env.VITE_DEMO_MODE !== "true") {
  void import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        window.dispatchEvent(new Event("pwa-update"));
      },
    });
    window.addEventListener("pwa-apply", () => {
      void updateSW(true);
    });
  });
}
