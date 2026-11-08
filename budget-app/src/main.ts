import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./household/app.css";

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
