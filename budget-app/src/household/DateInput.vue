<script setup lang="ts">
import { tr, intlLocale, locale } from "../i18n";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  useId,
  watch,
  type CSSProperties,
} from "vue";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from "@lucide/vue";
import {
  calendarDayLabel,
  calendarMonthLabel,
  displayCalendarValue,
  isoDay,
  localToday,
  parseCalendarValue,
  shiftCalendarMonth,
  type DateMode,
} from "./calendar";

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    label: string;
    mode?: DateMode;
    id?: string;
    required?: boolean;
    disabled?: boolean;
    compact?: boolean;
    min?: string;
    max?: string;
  }>(),
  { mode: "date" },
);
const emit = defineEmits<{
  "update:modelValue": [value: string];
  change: [value: string];
}>();
const uid = useId();
const input = ref<HTMLInputElement>();
const compactButton = ref<HTMLButtonElement>();
const control = ref<HTMLElement>();
const panel = ref<HTMLDialogElement>();
const opened = ref(false);
const draft = ref("");
const touched = ref(false);
const view = ref<"days" | "months" | "years">("days");
const cursor = ref(localToday().slice(0, 7));
const focusedDay = ref(localToday());
const position = ref<CSSProperties>({});
const year = computed(() => Number(cursor.value.slice(0, 4)));
const yearPage = computed(() => Math.floor(year.value / 12) * 12);
const years = computed(() =>
  Array.from({ length: 12 }, (_, index) => yearPage.value + index).filter(
    (value) => value >= 1000 && value <= 9999,
  ),
);
const months = computed(() =>
  Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(intlLocale(), {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, index, 1))),
  ),
);
const weekdays = computed(() => [
  [tr("Pn"), tr("poniedziałek")],
  [tr("Wt"), tr("wtorek")],
  [tr("Śr"), tr("środa")],
  [tr("Cz"), tr("czwartek")],
  [tr("Pt"), tr("piątek")],
  [tr("So"), tr("sobota")],
  [tr("Nd"), tr("niedziela")],
]);
const validValue = computed(() =>
  parseCalendarValue(props.modelValue || "", props.mode),
);
const compactLabel = computed(() =>
  validValue.value
    ? calendarMonthLabel(validValue.value)
    : tr("Wybierz miesiąc"),
);
const heading = computed(() =>
  view.value === "days"
    ? calendarMonthLabel(cursor.value)
    : view.value === "months"
      ? String(year.value)
      : `${yearPage.value}–${yearPage.value + 11}`,
);
function allowed(value: string) {
  return (
    Number(value.slice(0, 4)) >= 1000 &&
    Number(value.slice(0, 4)) <= 9999 &&
    (!props.min || value >= props.min) &&
    (!props.max || value <= props.max)
  );
}
const error = computed(() => {
  if (!draft.value.trim()) return props.required ? tr("Wybierz datę.") : "";
  const value = parseCalendarValue(draft.value, props.mode);
  if (!value)
    return props.mode === "month"
      ? tr("Podaj poprawny miesiąc w formacie MM.RRRR.")
      : tr("Podaj poprawną datę w formacie DD.MM.RRRR.");
  return allowed(value) ? "" : tr("Data jest poza dozwolonym zakresem.");
});
watch(
  [() => props.modelValue, locale],
  ([value]) => {
    draft.value = displayCalendarValue(value || "", props.mode);
  },
  { immediate: true },
);
watch(error, (value) => input.value?.setCustomValidity(value), {
  flush: "post",
});
const weeks = computed(() => {
  const first = new Date(`${cursor.value}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first.getTime() + (index - offset) * 86400000);
    const iso = isoDay(date);
    return {
      iso,
      day: date.getUTCDate(),
      outside: !iso.startsWith(cursor.value),
      today: iso === localToday(),
      selected: iso === validValue.value,
      disabled: !allowed(iso),
    };
  });
  return Array.from({ length: 6 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
});
function publish(value: string) {
  draft.value = displayCalendarValue(value, props.mode);
  touched.value = false;
  input.value?.setCustomValidity("");
  emit("update:modelValue", value);
  emit("change", value);
}
function type(event: Event) {
  draft.value = (event.target as HTMLInputElement).value;
  const value = parseCalendarValue(draft.value, props.mode);
  input.value?.setCustomValidity(error.value);
  if (value && allowed(value)) {
    emit("update:modelValue", value);
    emit("change", value);
  } else if (!draft.value.trim()) {
    emit("update:modelValue", "");
    emit("change", "");
  }
}
function finishTyping() {
  touched.value = true;
  const value = parseCalendarValue(draft.value, props.mode);
  if (value && allowed(value))
    draft.value = displayCalendarValue(value, props.mode);
}
const mobile = () => matchMedia("(max-width: 600px)").matches;
function placePanel() {
  if (mobile()) {
    position.value = {};
    return;
  }
  const rect = control.value?.getBoundingClientRect();
  if (!rect || !panel.value) return;
  const width = Math.min(Math.max(rect.width, 340), 380, innerWidth - 32);
  const height = Math.min(panel.value.scrollHeight, innerHeight - 32);
  position.value = {
    width: `${width}px`,
    left: `${Math.min(Math.max(16, rect.left), innerWidth - width - 16)}px`,
    top: `${rect.bottom + height + 8 <= innerHeight - 16 ? rect.bottom + 8 : Math.max(16, rect.top - height - 8)}px`,
    maxHeight: `${innerHeight - 32}px`,
  };
}
async function focusSelection() {
  await nextTick();
  placePanel();
  const target =
    view.value === "days"
      ? `[data-date="${focusedDay.value}"]`
      : view.value === "months"
        ? `[data-month="${Number(cursor.value.slice(5, 7))}"]`
        : `[data-year="${year.value}"]`;
  panel.value
    ?.querySelector<HTMLButtonElement>(target)
    ?.focus({ preventScroll: true });
}
async function open() {
  if (props.disabled || opened.value) return;
  const value =
    validValue.value || localToday().slice(0, props.mode === "month" ? 7 : 10);
  cursor.value = value.slice(0, 7);
  focusedDay.value = props.mode === "date" ? value : `${value}-01`;
  view.value = props.mode === "month" ? "months" : "days";
  opened.value = true;
  await nextTick();
  panel.value?.showModal();
  await focusSelection();
  window.addEventListener("resize", placePanel);
}
function close() {
  panel.value?.close();
  opened.value = false;
  window.removeEventListener("resize", placePanel);
  (props.compact ? compactButton.value : input.value)?.focus({
    preventScroll: true,
  });
}
function choose(value: string) {
  if (!allowed(value)) return;
  publish(value);
  close();
}
function monthValue(index: number) {
  return `${year.value}-${String(index + 1).padStart(2, "0")}`;
}
async function chooseMonth(index: number) {
  const value = monthValue(index);
  if (props.mode === "month") choose(value);
  else {
    cursor.value = value;
    focusedDay.value = `${value}-01`;
    view.value = "days";
    await focusSelection();
  }
}
async function chooseYear(value: number) {
  cursor.value = `${value}-${cursor.value.slice(5, 7)}`;
  view.value = "months";
  await focusSelection();
}
async function zoomOut() {
  view.value = view.value === "days" ? "months" : "years";
  await focusSelection();
}
async function navigate(direction: number) {
  const shifted = shiftCalendarMonth(
    `${cursor.value}-01`,
    direction *
      (view.value === "days" ? 1 : view.value === "months" ? 12 : 144),
  ).slice(0, 7);
  if (Number(shifted.slice(0, 4)) < 1000 || Number(shifted.slice(0, 4)) > 9999)
    return;
  cursor.value = shifted;
  focusedDay.value = `${shifted}-01`;
  await nextTick();
  placePanel();
}
async function dayKey(event: KeyboardEvent, value: string) {
  let target: string | undefined;
  const date = new Date(`${value}T00:00:00Z`);
  const offsets: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
    Home: -((date.getUTCDay() + 6) % 7),
    End: 6 - ((date.getUTCDay() + 6) % 7),
  };
  if (event.key in offsets)
    target = isoDay(new Date(date.getTime() + offsets[event.key]! * 86400000));
  if (event.key === "PageUp" || event.key === "PageDown")
    target = shiftCalendarMonth(
      value,
      (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1),
    );
  if (target) {
    event.preventDefault();
    if (!allowed(target)) return;
    focusedDay.value = target;
    cursor.value = target.slice(0, 7);
    await focusSelection();
  }
}
function invalid() {
  touched.value = true;
  if (
    !input.value?.form ||
    input.value.form.querySelector(":invalid") === input.value
  )
    void open();
}
onBeforeUnmount(() => {
  window.removeEventListener("resize", placePanel);
  panel.value?.close();
});
</script>

<template>
  <span
    ref="control"
    :class="['date-input', { 'date-input-compact': compact }]"
  >
    <button
      v-if="compact"
      ref="compactButton"
      type="button"
      class="date-compact-trigger"
      :id="id"
      :aria-label="label"
      aria-haspopup="dialog"
      :aria-expanded="opened"
      :aria-controls="`${uid}-calendar`"
      :disabled="disabled"
      @click="open"
    >
      <span>{{ compactLabel }}</span
      ><ChevronDown :size="14" aria-hidden="true" />
    </button>
    <span
      v-else
      :class="['date-control', { 'date-control-invalid': touched && error }]"
    >
      <input
        ref="input"
        :id="id"
        class="date-text"
        type="text"
        inputmode="numeric"
        :value="draft"
        :aria-label="label"
        :placeholder="
          locale === 'pl'
            ? mode === 'month'
              ? 'MM.RRRR'
              : 'DD.MM.RRRR'
            : mode === 'month'
              ? 'MM/YYYY'
              : 'DD/MM/YYYY'
        "
        :required="required"
        :disabled="disabled"
        :maxlength="mode === 'month' ? 7 : 10"
        :aria-invalid="(touched && !!error) || undefined"
        :aria-describedby="touched && error ? `${uid}-error` : undefined"
        autocomplete="off"
        @input="type"
        @blur="finishTyping"
        @invalid.prevent="invalid"
        @keydown.down.prevent="open"
      />
      <button
        type="button"
        class="date-icon"
        :aria-label="tr('Otwórz kalendarz: {0}', { 0: label })"
        aria-haspopup="dialog"
        :aria-expanded="opened"
        :aria-controls="`${uid}-calendar`"
        :disabled="disabled"
        @click.prevent="open"
      >
        <CalendarDays :size="19" aria-hidden="true" />
      </button>
    </span>
    <small
      v-if="!compact && touched && error"
      :id="`${uid}-error`"
      class="date-error"
      role="alert"
      >{{ error }}</small
    >
    <Teleport to="body"
      ><dialog
        v-if="opened"
        ref="panel"
        :id="`${uid}-calendar`"
        class="calendar-panel"
        :style="position"
        :aria-label="tr('Kalendarz: {0}', { 0: label })"
        tabindex="-1"
        @cancel.prevent.stop="close"
        @click="
          (event) => {
            if (event.target === panel) close();
          }
        "
      >
        <div class="calendar-handle" aria-hidden="true" />
        <header class="calendar-header">
          <span>{{ label }}</span
          ><button
            type="button"
            class="icon-button"
            :aria-label="tr('Zamknij kalendarz: {0}', { 0: label })"
            @click="close"
          >
            <X :size="20" />
          </button>
        </header>
        <div class="calendar-nav">
          <button
            type="button"
            class="icon-button"
            :aria-label="
              view === 'days'
                ? tr('Poprzedni miesiąc kalendarza')
                : tr('Poprzednie lata kalendarza')
            "
            @click="navigate(-1)"
          >
            <ChevronLeft :size="20" /></button
          ><button
            type="button"
            class="calendar-heading"
            :aria-label="
              view === 'days' ? tr('Wybierz miesiąc i rok') : tr('Wybierz rok')
            "
            @click="zoomOut"
          >
            {{ heading }}<ChevronDown :size="15" /></button
          ><button
            type="button"
            class="icon-button"
            :aria-label="
              view === 'days'
                ? tr('Następny miesiąc kalendarza')
                : tr('Następne lata kalendarza')
            "
            @click="navigate(1)"
          >
            <ChevronRight :size="20" />
          </button>
        </div>
        <div
          v-if="view === 'days'"
          class="calendar-grid"
          role="grid"
          :aria-label="calendarMonthLabel(cursor)"
        >
          <div class="calendar-week" role="row">
            <span
              v-for="day in weekdays"
              :key="day[1]"
              role="columnheader"
              :aria-label="day[1]"
              class="calendar-weekday"
              >{{ day[0] }}</span
            >
          </div>
          <div
            v-for="(week, index) in weeks"
            :key="index"
            class="calendar-week"
            role="row"
          >
            <button
              v-for="day in week"
              :key="day.iso"
              type="button"
              role="gridcell"
              :class="[
                'calendar-day',
                { outside: day.outside, today: day.today },
              ]"
              :data-date="day.iso"
              :aria-label="calendarDayLabel(day.iso)"
              :aria-selected="day.selected"
              :aria-current="day.today ? 'date' : undefined"
              :disabled="day.disabled"
              :tabindex="day.iso === focusedDay ? 0 : -1"
              @focus="focusedDay = day.iso"
              @keydown="dayKey($event, day.iso)"
              @click="choose(day.iso)"
            >
              {{ day.day }}
            </button>
          </div>
        </div>
        <div
          v-else-if="view === 'months'"
          class="calendar-period-grid"
          role="grid"
          :aria-label="tr('Miesiące {0}', { 0: year })"
        >
          <div
            v-for="row in 4"
            :key="row"
            class="calendar-period-row"
            role="row"
          >
            <button
              v-for="index in [0, 1, 2].map((column) => (row - 1) * 3 + column)"
              :key="index"
              type="button"
              role="gridcell"
              class="calendar-period"
              :data-month="index + 1"
              :aria-label="`${months[index]} ${year}`"
              :aria-selected="validValue?.slice(0, 7) === monthValue(index)"
              :disabled="mode === 'month' && !allowed(monthValue(index))"
              @click="chooseMonth(index)"
            >
              {{ months[index] }}
            </button>
          </div>
        </div>
        <div
          v-else
          class="calendar-period-grid"
          role="grid"
          :aria-label="tr('Wybór roku')"
        >
          <div
            v-for="row in 4"
            :key="row"
            class="calendar-period-row"
            role="row"
          >
            <button
              v-for="value in years.slice((row - 1) * 3, row * 3)"
              :key="value"
              type="button"
              role="gridcell"
              class="calendar-period"
              :data-year="value"
              :aria-selected="validValue?.startsWith(String(value)) || false"
              @click="chooseYear(value)"
            >
              {{ value }}
            </button>
          </div>
        </div>
        <footer class="calendar-footer">
          <button type="button" class="text-button" @click="close">
            {{ tr("Anuluj") }}</button
          ><button
            type="button"
            class="text-button"
            :disabled="
              !allowed(localToday().slice(0, mode === 'month' ? 7 : 10))
            "
            @click="choose(localToday().slice(0, mode === 'month' ? 7 : 10))"
          >
            {{ mode === "month" ? tr("Ten miesiąc") : tr("Dzisiaj") }}
          </button>
        </footer>
      </dialog></Teleport
    >
  </span>
</template>

<style scoped>
.date-input {
  display: block;
  min-width: 0;
  width: 100%;
}
.date-control {
  display: flex;
  align-items: center;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-soft);
  color: var(--ink);
}
.date-control:focus-within {
  border-color: var(--teal);
}
.date-control-invalid {
  border-color: var(--danger);
}
.date-text {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  border: 0;
  outline: 0;
  border-radius: inherit;
  background: transparent;
  padding: 12px;
  color: var(--ink);
  font-size: 14px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.date-text::placeholder {
  color: var(--muted);
}
.date-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  min-height: 44px;
  width: 44px;
  background: none;
  color: var(--muted);
  border: 0;
  border-radius: 10px;
}
.date-icon:hover {
  color: var(--teal);
  background: var(--teal-soft);
}
.date-error {
  display: block;
  margin-top: 7px;
  color: var(--danger);
  font-size: 11px;
  line-height: 1.5;
}
.date-input-compact {
  width: auto;
}
.date-compact-trigger {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 160px;
  min-height: 44px;
  padding: 10px 6px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
  text-transform: capitalize;
}
.date-compact-trigger svg {
  color: var(--muted);
}
.calendar-panel {
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 16px;
  width: 340px;
  max-width: calc(100vw - 32px);
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--surface);
  color: var(--ink);
  overflow-y: auto;
  box-shadow: 0 18px 65px #102a3b25;
}
.calendar-panel:focus {
  outline: none;
}
.calendar-panel::backdrop {
  background: #13232e16;
}
.calendar-handle {
  display: none;
}
.calendar-header,
.calendar-nav,
.calendar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.calendar-header {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--muted);
}
.calendar-header .icon-button {
  width: 34px;
  min-height: 34px;
}
.calendar-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  min-height: 44px;
  padding: 8px 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--ink);
  font-size: 15px;
  font-weight: 650;
  text-transform: capitalize;
}
.calendar-heading:hover {
  background: var(--surface-soft);
}
.calendar-week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 3px;
}
.calendar-weekday {
  padding: 12px 0 8px;
  text-align: center;
  font-size: 10px;
  font-weight: 550;
  color: var(--muted);
}
.calendar-day {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  padding: 0;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: var(--ink);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.calendar-day.outside {
  color: var(--muted);
  opacity: 0.6;
}
.calendar-day.today {
  border-color: var(--teal);
}
.calendar-day:hover:not(:disabled),
.calendar-period:hover:not(:disabled) {
  background: var(--surface-soft);
}
.calendar-day[aria-selected="true"],
.calendar-period[aria-selected="true"] {
  background: var(--teal);
  color: var(--surface);
  font-weight: 650;
  opacity: 1;
}
.calendar-day:focus-visible,
.calendar-period:focus-visible {
  outline: 2px solid var(--teal);
  outline-offset: -2px;
}
.calendar-day[aria-selected="true"]:focus-visible {
  outline-color: var(--ink);
}
.calendar-period-grid {
  padding: 12px 0;
}
.calendar-period-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin: 7px 0;
}
.calendar-period {
  min-height: 47px;
  min-width: 0;
  padding: 8px 3px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--ink);
  font-size: 12px;
  text-transform: capitalize;
}
.calendar-footer {
  border-top: 1px solid var(--line);
  padding-top: 8px;
  margin-top: 12px;
}
@media (max-width: 600px) {
  .date-text {
    font-size: 16px;
  }
  .calendar-panel {
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: 100%;
    max-width: none;
    max-height: 90dvh;
    margin: 0;
    padding: 8px 18px calc(18px + env(safe-area-inset-bottom));
    border-radius: 24px 24px 0 0;
  }
  .calendar-panel::backdrop {
    background: #13232e65;
    backdrop-filter: blur(3px);
  }
  .calendar-handle {
    display: block;
    width: 36px;
    height: 4px;
    margin: 0 auto 14px;
    border-radius: 8px;
    background: var(--line);
  }
  .calendar-header {
    font-size: 13px;
  }
  .calendar-heading {
    font-size: 17px;
  }
  .calendar-day {
    font-size: 15px;
  }
  .calendar-period {
    min-height: 50px;
    font-size: 14px;
  }
  .calendar-weekday {
    font-size: 11px;
  }
}
</style>
