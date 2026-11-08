import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./style.css";
import { setLanguage, languageTag } from "../src/i18n/language";

const language = document.documentElement.lang === "en" ? "en" : "pl";
setLanguage(language);
document
  .querySelectorAll<HTMLAnchorElement>("[data-language]")
  .forEach((link) =>
    link.addEventListener("click", () =>
      setLanguage(link.dataset.language === "en" ? "en" : "pl"),
    ),
  );
const themeButton = document.querySelector<HTMLButtonElement>(".site-theme");
const themeMeta = document.querySelector<HTMLMetaElement>(
  'meta[name="theme-color"]',
);
let theme: "light" | "dark" =
  document.documentElement.dataset.theme === "light" ? "light" : "dark";
function applyTheme(value: "light" | "dark") {
  theme = value;
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
  themeMeta?.setAttribute("content", value === "dark" ? "#111a20" : "#f3f7f8");
  const label =
    value === "dark"
      ? language === "en"
        ? "Switch to light theme"
        : "Włącz jasny wygląd"
      : language === "en"
        ? "Switch to dark theme"
        : "Włącz ciemny wygląd";
  themeButton?.setAttribute("aria-label", label);
  themeButton?.setAttribute("title", label);
  themeButton?.setAttribute("aria-pressed", String(value === "dark"));
}
applyTheme(theme);
themeButton?.addEventListener("click", () => {
  const next = theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem("theme", next);
  } catch {
    /* The active page still switches themes. */
  }
  applyTheme(next);
});

const format = (value: number) =>
  new Intl.NumberFormat(languageTag(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
document
  .querySelectorAll<HTMLButtonElement>("[data-period]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const factor = button.dataset.period === "year" ? 12 : 1;
      for (const tab of document.querySelectorAll<HTMLButtonElement>(
        "[data-period]",
      )) {
        tab.classList.toggle("selected", tab === button);
        tab.setAttribute("aria-pressed", String(tab === button));
      }
      document.querySelector("[data-income]")!.innerHTML =
        `${format(10800 * factor)} <small>${language === "en" ? "PLN" : "zł"}</small>`;
      document.querySelector("[data-remaining]")!.innerHTML =
        `${format(4559.8 * factor)} <small>${language === "en" ? "PLN" : "zł"}</small>`;
      document
        .querySelectorAll<HTMLElement>("[data-value]")
        .forEach((element) => {
          element.textContent = `${format(Number(element.dataset.value) * factor)} ${language === "en" ? "PLN" : "zł"}`;
        });
    });
  });
document
  .querySelector<HTMLButtonElement>(".copy-command")
  ?.addEventListener("click", async () => {
    const text = document.querySelector("#install-command")!.textContent!;
    const status = document.querySelector(".copy-status")!;
    try {
      await navigator.clipboard.writeText(text);
      status.textContent =
        language === "en"
          ? "Copied. Paste the command into your terminal."
          : "Skopiowano. Wklej polecenie w terminalu.";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector("#install-command")!);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      status.textContent =
        language === "en"
          ? "Command selected. Use your keyboard shortcut to copy it."
          : "Zaznaczono polecenie. Skopiuj je skrótem klawiaturowym.";
    }
  });
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries)
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      }
  },
  { threshold: 0.08 },
);
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document
    .querySelectorAll(".section-intro, .feature, .demo-section")
    .forEach((element) => {
      element.classList.add("reveal");
      observer.observe(element);
    });
}
