import { ref } from "vue";
import {
  getLanguage,
  setLanguage,
  languageTag,
  translate,
  errorText,
  type Language,
} from "./core";

export const locale = ref<Language>(getLanguage());
export const tr = (source: string, params: Record<string, unknown> = {}) =>
  translate(source, params, locale.value);
export const intlLocale = () => languageTag(locale.value);
export const translatedError = (value: unknown) =>
  errorText(value, locale.value);
export function changeLanguage(value: Language) {
  setLanguage(value);
}
if (typeof window !== "undefined") {
  setLanguage(locale.value);
  window.addEventListener("homebudget-language", ((
    event: CustomEvent<Language>,
  ) => {
    locale.value = event.detail;
  }) as EventListener);
}
