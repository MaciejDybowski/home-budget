import en from "./en.json";
import errorMessages from "./errors.en.json";
import polish from "./pl.json";

import { getLanguage, type Language } from "./language";
export {
  getLanguage,
  setLanguage,
  languageTag,
  type Language,
} from "./language";
const messages: Record<string, string> = { ...en, ...errorMessages };
const plMessages: Record<string, string> = polish;
const reverse = new Map(
  [...Object.entries(messages), ...Object.entries(plMessages)].map(
    ([source, value]) => [value, source] as const,
  ),
);
export function translate(
  source: string,
  params: Record<string, unknown> = {},
  selected: Language = getLanguage(),
): string {
  const key = messages[source] ? source : reverse.get(source) || source;
  let text = selected === "en" ? messages[key] || key : plMessages[key] || key;
  if (selected === "en") {
    for (const [slot, value] of Object.entries(params)) {
      if (Number(value) !== 1) continue;
      for (const [plural, singular] of [
        ["transactions", "transaction"],
        ["entries", "entry"],
        ["rows", "row"],
        ["months", "month"],
        ["rules", "rule"],
        ["saved matches", "saved match"],
        ["days", "day"],
        ["income entries", "income entry"],
      ]) {
        text = text.replace(`{${slot}} ${plural}`, `{${slot}} ${singular}`);
      }
    }
  }
  if (selected === "pl") {
    const rules = new Intl.PluralRules("pl");
    for (const [slot, value] of Object.entries(params)) {
      if (!Number.isFinite(Number(value))) continue;
      const form = rules.select(Number(value));
      const noun = (one: string, few: string, many: string) =>
        form === "one" ? one : form === "few" ? few : many;
      text = text
        .replace(
          `{${slot}} operacji`,
          `{${slot}} ${noun(key.startsWith("Zapisano") ? "operację" : "operacja", "operacje", "operacji")}`,
        )
        .replace(
          `{${slot}} wierszy`,
          `{${slot}} ${noun("wiersz", "wiersze", "wierszy")}`,
        )
        .replace(
          `{${slot}} wpisów`,
          `{${slot}} ${noun("wpis", "wpisy", "wpisów")}`,
        )
        .replace(
          `{${slot}} zapamiętanych dopasowań`,
          `{${slot}} ${noun("zapamiętane dopasowanie", "zapamiętane dopasowania", "zapamiętanych dopasowań")}`,
        )
        .replace(`{${slot}} dni`, `{${slot}} ${noun("dzień", "dni", "dni")}`)
        .replace(
          `{${slot}} błędnych wierszy`,
          `{${slot}} ${noun("błędny wiersz", "błędne wiersze", "błędnych wierszy")}`,
        )
        .replace(
          `{${slot}} zapisanych reguł`,
          `{${slot}} ${noun("zapisana reguła", "zapisane reguły", "zapisanych reguł")}`,
        )
        .replace(
          `{${slot}} pozostałych operacjach`,
          `{${slot}} ${form === "one" ? "pozostałej operacji" : "pozostałych operacjach"}`,
        );
    }
  }
  return text.replace(/\{([\w]+)\}/g, (match, name: string) =>
    name in params ? String(params[name] ?? "") : match,
  );
}
const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function errorText(
  value: unknown,
  selected: Language = getLanguage(),
): string {
  const source = Array.isArray(value) ? value.join(" ") : String(value || "");
  if (messages[source] || reverse.has(source))
    return translate(source, {}, selected);
  for (const key of Object.keys(errorMessages).filter((key) =>
    /\{\d+\}/.test(key),
  )) {
    const slots = [...key.matchAll(/\{(\d+)\}/g)].map((match) => match[1]!);
    const pattern =
      "^" +
      key
        .split(/\{\d+\}/g)
        .map(escapePattern)
        .join("(.+?)") +
      "$";
    const match = new RegExp(pattern).exec(source);
    if (match)
      return translate(
        key,
        Object.fromEntries(
          slots.map((slot, index) => [
            slot,
            key.startsWith("Nieprawidłowe pole:")
              ? translate(match[index + 1]!, {}, selected)
              : match[index + 1],
          ]),
        ),
        selected,
      );
  }
  return translate("Nie udało się wykonać operacji.", {}, selected);
}
export function translateRecord<T>(value: T, inherited = false): T {
  if (typeof value === "string")
    return inherited ? (translate(value) as T) : value;
  if (Array.isArray(value))
    return value.map((item) => translateRecord(item, inherited)) as T;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sample = inherited || record.demoSeed === true;
    return Object.fromEntries(
      Object.entries(record)
        .filter(([name]) => name !== "demoSeed" && name !== "demoSeedMerchant")
        .map(([name, item]) => [
          name,
          name === "merchant" &&
          record.demoSeedMerchant === true &&
          typeof item === "string"
            ? translate(item)
            : translateRecord(item, sample),
        ]),
    ) as T;
  }
  return value;
}
