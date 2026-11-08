export type Language = "en" | "pl";
const storageKey = "homebudget.language.v1";
function initialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const requested = new URL(window.location.href).searchParams.get("lang");
  if (requested === "en" || requested === "pl") return requested;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === "en" || saved === "pl") return saved;
  } catch {
    /* Fall back to the browser language. */
  }
  return navigator.language.toLowerCase().startsWith("pl") ? "pl" : "en";
}
let language = initialLanguage();
export const getLanguage = () => language;
export const languageTag = (value: Language = language) =>
  value === "pl" ? "pl-PL" : "en-GB";
export function setLanguage(value: Language) {
  language = value;
  if (typeof document !== "undefined") document.documentElement.lang = value;
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    /* Keep the current page usable without storage. */
  }
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.set("lang", value);
      history.replaceState(history.state, "", url);
    }
    window.dispatchEvent(
      new CustomEvent("homebudget-language", { detail: value }),
    );
  }
}
