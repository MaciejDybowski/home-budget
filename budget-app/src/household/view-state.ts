import { ref, watch, type Ref } from "vue";

// Share navigation preferences between views and retain them on a tab reload.
// Financial records, form drafts and uploaded files are never persisted here.
const preferences = new Map<string, Ref<string>>();

export function viewPreference(
  key: string,
  fallback: string,
  valid: (value: string) => boolean = () => true,
): Ref<string> {
  const existing = preferences.get(key);
  if (existing) return existing;
  const storageKey = `homebudget.view.v1.${key}`;
  let initial = fallback;
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved !== null && saved.length <= 500 && valid(saved)) initial = saved;
  } catch {
    // Browsing still works when storage is unavailable.
  }
  const value = ref(initial);
  preferences.set(key, value);
  watch(
    value,
    (next) => {
      try {
        sessionStorage.setItem(storageKey, next);
      } catch {
        // Keep the in-memory preference even when browser storage is restricted.
      }
    },
    { flush: "sync" },
  );
  return value;
}

export const oneOf =
  (...values: string[]) =>
  (value: string) =>
    values.includes(value);
export const validMonth = (value: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
