<script setup lang="ts">
import { tr } from "../i18n";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  useId,
  type CSSProperties,
} from "vue";
import { Check, ChevronDown, Search, X, Plus } from "@lucide/vue";

type Value = string | null | undefined;
interface Option {
  value: Value;
  label: string;
  color?: string;
}
const props = withDefaults(
  defineProps<{
    modelValue?: Value;
    options: Option[];
    label: string;
    placeholder?: string;
    emptyLabel?: string;
    disabled?: boolean;
    required?: boolean;
    id?: string;
    creatable?: boolean;
  }>(),
  {},
);
const emit = defineEmits<{
  "update:modelValue": [value: Value];
  change: [value: Value];
  create: [name: string];
}>();
const uid = useId();
const listId = `${uid}-options`;
const titleId = `${uid}-title`;
const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLDialogElement>();
const search = ref<HTMLInputElement>();
const opened = ref(false);
const query = ref("");
const position = ref<CSSProperties>({});
const selected = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
);
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .toLocaleLowerCase("pl")
    .trim();
const filtered = computed(() =>
  props.options.filter((option) =>
    normalize(option.label).includes(normalize(query.value)),
  ),
);
const canCreate = computed(
  () =>
    props.creatable &&
    query.value.trim().length > 0 &&
    !props.options.some(
      (option) => normalize(option.label) === normalize(query.value),
    ),
);
function createOption() {
  if (!canCreate.value) return;
  emit("create", query.value.trim());
  close();
}
const mobile = () => matchMedia("(max-width: 600px)").matches;

function placePanel() {
  if (mobile()) {
    position.value = {};
    return;
  }
  const rect = trigger.value?.getBoundingClientRect();
  if (!rect || !panel.value) return;
  const width = Math.min(Math.max(rect.width, 320), 420, innerWidth - 32);
  const height = Math.min(panel.value.scrollHeight, 480, innerHeight - 32);
  const top =
    rect.bottom + height + 8 <= innerHeight - 16
      ? rect.bottom + 8
      : Math.max(16, rect.top - height - 8);
  position.value = {
    left: `${Math.min(Math.max(16, rect.left), innerWidth - width - 16)}px`,
    top: `${top}px`,
    width: `${width}px`,
    maxHeight: `${innerHeight - 32}px`,
  };
}
async function open(initialQuery = "") {
  if (props.disabled || opened.value) return;
  query.value = initialQuery;
  opened.value = true;
  await nextTick();
  panel.value?.showModal();
  placePanel();
  if (!mobile() || initialQuery) search.value?.focus({ preventScroll: true });
  else panel.value?.focus({ preventScroll: true });
  window.addEventListener("resize", placePanel);
}
function close() {
  panel.value?.close();
  opened.value = false;
  window.removeEventListener("resize", placePanel);
  trigger.value?.focus({ preventScroll: true });
}
function choose(option: Option) {
  emit("update:modelValue", option.value);
  emit("change", option.value);
  close();
}
function triggerKey(event: KeyboardEvent) {
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    void open();
  } else if (
    event.key.length === 1 &&
    event.key !== " " &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  ) {
    event.preventDefault();
    void open(event.key);
  }
}
function panelKey(event: KeyboardEvent) {
  const options = [
    ...(panel.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') ||
      []),
  ];
  const current = options.indexOf(document.activeElement as HTMLButtonElement);
  let next: number | undefined;
  if (event.key === "ArrowDown")
    next = current < 0 ? 0 : (current + 1) % options.length;
  if (event.key === "ArrowUp")
    next =
      current < 0
        ? options.length - 1
        : (current - 1 + options.length) % options.length;
  if (document.activeElement !== search.value) {
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = options.length - 1;
  }
  if (next !== undefined) {
    event.preventDefault();
    options[next]?.focus();
  }
  if (event.key === "Enter" && document.activeElement === search.value) {
    event.preventDefault();
    if (filtered.value[0]) choose(filtered.value[0]);
    else if (canCreate.value) createOption();
  }
}
onBeforeUnmount(() => {
  window.removeEventListener("resize", placePanel);
  panel.value?.close();
});
</script>

<template>
  <span class="choice-select">
    <button
      ref="trigger"
      :id="id"
      type="button"
      class="choice-trigger"
      role="combobox"
      :aria-label="label"
      aria-haspopup="dialog"
      :aria-expanded="opened"
      :aria-controls="listId"
      :aria-required="required || undefined"
      :disabled="disabled"
      @click="open()"
      @keydown="triggerKey"
    >
      <span
        v-if="selected?.color"
        class="category-dot"
        :style="{ background: selected.color }"
        aria-hidden="true"
      />
      <span :class="['choice-value', { muted: !selected }]">{{
        modelValue === "" && emptyLabel
          ? emptyLabel
          : selected?.label || placeholder || tr("Wybierz…")
      }}</span>
      <ChevronDown :size="17" aria-hidden="true" />
    </button>
    <input
      v-if="required"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      :value="modelValue || ''"
      required
      @invalid.prevent="open()"
    />
    <Teleport to="body">
      <dialog
        v-if="opened"
        ref="panel"
        class="choice-panel"
        :style="position"
        :aria-labelledby="titleId"
        tabindex="-1"
        @cancel.prevent.stop="close"
        @keydown="panelKey"
        @click="
          (event) => {
            if (event.target === panel) close();
          }
        "
      >
        <div class="choice-handle" aria-hidden="true" />
        <header class="choice-header">
          <h2 :id="titleId">{{ label }}</h2>
          <button
            type="button"
            class="icon-button"
            :aria-label="tr('Zamknij wybór: {0}', { 0: label })"
            @click="close"
          >
            <X :size="20" />
          </button>
        </header>
        <label class="choice-search"
          ><Search :size="18" aria-hidden="true" /><input
            ref="search"
            v-model="query"
            type="search"
            :aria-label="tr('Szukaj: {0}', { 0: label })"
            :placeholder="tr('Szukaj na liście…')"
            autocomplete="off"
            :maxlength="creatable ? 200 : undefined"
        /></label>
        <div
          :id="listId"
          class="choice-options"
          role="listbox"
          :aria-label="label"
        >
          <button
            v-for="(option, index) in filtered"
            :key="`${String(option.value)}-${index}`"
            type="button"
            role="option"
            :aria-selected="option.value === modelValue"
            class="choice-option"
            @click="choose(option)"
          >
            <span
              v-if="option.color"
              class="category-dot"
              :style="{ background: option.color }"
              aria-hidden="true"
            /><span class="grow">{{ option.label }}</span
            ><Check
              v-if="option.value === modelValue"
              :size="18"
              aria-hidden="true"
            />
          </button>
          <button
            v-if="canCreate"
            type="button"
            role="option"
            aria-selected="false"
            class="choice-option"
            @click="createOption"
          >
            <Plus :size="18" /><span>{{
              tr("Dodaj sklep „{0}”", { 0: query.trim() })
            }}</span>
          </button>
          <p
            v-if="!filtered.length && !canCreate"
            class="choice-empty"
            role="status"
          >
            {{
              options.length
                ? tr("Brak pasujących opcji. Zmień wyszukiwanie.")
                : tr(
                    "Lista jest pusta. Najpierw dodaj odpowiedni wpis w ustawieniach.",
                  )
            }}
          </p>
        </div>
      </dialog>
    </Teleport>
  </span>
</template>

<style scoped>
.choice-select {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
}
.choice-select > .sr-only {
  inset: 0 auto auto 0;
  width: 1px;
  height: 1px;
  min-height: 0;
  padding: 0;
  border: 0;
}
.choice-trigger {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-width: 0;
  min-height: 46px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-soft);
  color: var(--ink);
  font-size: 14px;
  font-weight: 400;
  text-align: left;
}
.choice-trigger:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--teal) 40%, var(--line));
}
.choice-trigger[aria-expanded="true"] {
  border-color: var(--teal);
}
.choice-trigger > svg {
  color: var(--muted);
  margin-left: auto;
}
.choice-value {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.choice-panel {
  position: fixed;
  inset: auto;
  margin: 0;
  width: min(420px, calc(100vw - 32px));
  max-height: min(480px, calc(100dvh - 32px));
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 18px 65px #102a3b25;
  overflow: hidden;
}
.choice-panel[open] {
  display: flex;
  flex-direction: column;
}
.choice-panel:focus {
  outline: none;
}
.choice-panel::backdrop {
  background: #13232e16;
}
.choice-handle {
  display: none;
}
.choice-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.choice-header h2 {
  font-size: 16px;
}
.choice-header .icon-button {
  width: 36px;
  min-height: 36px;
}
.choice-search {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-soft);
  color: var(--muted);
  flex-shrink: 0;
  margin-bottom: 10px;
}
.choice-search:focus-within {
  border-color: var(--teal);
}
.choice-search input {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 10px 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  font-size: 14px;
}
.choice-options {
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
  max-height: 330px;
  padding: 2px;
  scrollbar-width: thin;
}
.choice-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 46px;
  padding: 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--ink);
  text-align: left;
  font-size: 13px;
  line-height: 1.5;
}
.choice-option + .choice-option {
  margin-top: 3px;
}
.choice-option:hover {
  background: var(--surface-soft);
}
.choice-option[aria-selected="true"] {
  background: var(--teal-soft);
  font-weight: 600;
}
.choice-option > svg {
  color: var(--teal);
}
.choice-option:focus-visible {
  outline-offset: -2px;
}
.choice-empty {
  padding: 24px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
  text-align: center;
}
@media (max-width: 600px) {
  .choice-trigger {
    font-size: 16px;
  }
  .choice-panel {
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: 100%;
    max-width: none;
    max-height: 78dvh;
    padding: 8px 18px calc(20px + env(safe-area-inset-bottom));
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -10px 60px #102a3b30;
  }
  .choice-panel::backdrop {
    background: #13232e65;
    backdrop-filter: blur(3px);
  }
  .choice-handle {
    display: block;
    flex-shrink: 0;
    width: 36px;
    height: 4px;
    margin: 0 auto 14px;
    border-radius: 8px;
    background: var(--line);
  }
  .choice-header h2 {
    font-size: 18px;
  }
  .choice-search input {
    font-size: 16px;
    min-height: 48px;
  }
  .choice-options {
    max-height: none;
  }
  .choice-option {
    min-height: 52px;
    padding: 14px 12px;
    font-size: 15px;
  }
}
</style>
