<script setup lang="ts">
import { tr } from "../i18n";
import { computed } from "vue";
import { ArrowRight, Columns3 } from "@lucide/vue";
import ChoiceSelect from "./ChoiceSelect.vue";
import { mappingFields, type CsvConfig, type CsvInspection } from "./csv";
const props = defineProps<{
  inspection: CsvInspection;
  modelValue: CsvConfig;
  busy: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: CsvConfig];
  inspect: [];
  preview: [];
}>();
const config = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
function set(key: keyof CsvConfig, value: unknown) {
  config.value = { ...config.value, [key]: value };
}
function column(key: string, value: string | null | undefined) {
  const columns = { ...config.value.columns };
  if (value === "" || value == null) delete columns[key];
  else columns[key] = Number(value);
  set("columns", columns);
}
const fields = computed(() =>
  mappingFields.value.filter(
    (f) => !f.modes || f.modes.includes(config.value.mode),
  ),
);
const readChanged = computed(() =>
  ["delimiter", "encoding", "headerRow", "hasHeader"].some(
    (key) =>
      config.value[key as keyof CsvConfig] !==
      props.inspection.config[key as keyof CsvConfig],
  ),
);
const ready = computed(
  () =>
    !readChanged.value &&
    fields.value.every(
      (f) => !f.required || config.value.columns[f.key] !== undefined,
    ) &&
    (config.value.columns.title !== undefined ||
      config.value.columns.counterparty !== undefined),
);
const letter = (index: number): string =>
  index < 26
    ? String.fromCharCode(65 + index)
    : letter(Math.floor(index / 26) - 1) +
      String.fromCharCode(65 + (index % 26));
function sample(key: string) {
  const index = config.value.columns[key];
  return index === undefined
    ? key === "currency"
      ? tr("Domyślnie PLN")
      : key === "bookingDate"
        ? tr("Domyślnie data operacji")
        : "—"
    : props.inspection.samples[0]?.[index] || tr("(puste)");
}
</script>

<template>
  <section class="card csv-mapping">
    <div class="section-heading">
      <h2><Columns3 :size="20" /> {{ tr("Dopasuj kolumny") }}</h2>
      <span class="muted small">{{
        tr("{0} wierszy", { 0: inspection.recordCount })
      }}</span>
    </div>
    <p class="muted small">
      {{
        tr(
          "Sprawdź podpowiedzi i przykładowe wartości. Przypisz datę, opis lub kontrahenta oraz kwotę. Pozostałe pola są opcjonalne.",
        )
      }}
    </p>
    <details class="csv-read-settings">
      <summary>{{ tr("Ustawienia odczytu pliku") }}</summary>
      <div class="two-columns">
        <label class="field"
          ><span>{{ tr("Separator kolumn") }}</span
          ><ChoiceSelect
            :model-value="config.delimiter"
            :disabled="busy"
            :label="tr('Separator kolumn')"
            :options="[
              { value: ';', label: tr('Średnik (;)') },
              { value: ',', label: tr('Przecinek (,)') },
              { value: '\t', label: tr('Tabulator') },
              { value: '|', label: tr('Pionowa kreska (|)') },
            ]"
            @update:model-value="set('delimiter', $event)"
        /></label>
        <label class="field"
          ><span>{{ tr("Kodowanie tekstu") }}</span
          ><ChoiceSelect
            :model-value="config.encoding"
            :disabled="busy"
            :label="tr('Kodowanie tekstu')"
            :options="
              ['utf-8', 'windows-1250', 'windows-1252'].map((value) => ({
                value,
                label: value.toUpperCase(),
              }))
            "
            @update:model-value="set('encoding', $event)"
        /></label>
        <label class="field"
          ><span>{{ tr("Pierwszy wiersz tabeli") }}</span
          ><input
            :value="config.headerRow + 1"
            type="number"
            min="1"
            max="101"
            :disabled="busy"
            @input="
              set(
                'headerRow',
                Number(($event.target as HTMLInputElement).value) - 1,
              )
            "
          /><small>{{
            tr(
              "Liczymy niepuste rekordy CSV; opis wielowierszowy jest jednym rekordem.",
            )
          }}</small></label
        >
        <label class="check-field"
          ><input
            :checked="config.hasHeader"
            type="checkbox"
            :disabled="busy"
            @change="
              set('hasHeader', ($event.target as HTMLInputElement).checked)
            "
          /><span>{{ tr("Pierwszy wiersz zawiera nazwy kolumn") }}</span></label
        >
      </div>
      <button
        class="button secondary"
        :disabled="busy"
        @click="emit('inspect')"
      >
        {{ tr("Odczytaj ponownie") }}
      </button>
    </details>
    <p v-if="readChanged" class="notice" role="status">
      {{
        tr(
          "Zmieniono sposób odczytu. Kliknij „Odczytaj ponownie”, aby odświeżyć kolumny.",
        )
      }}
    </p>
    <div class="two-columns csv-formats">
      <label class="field"
        ><span>{{ tr("Jak zapisano kwoty?") }}</span
        ><ChoiceSelect
          :model-value="config.mode"
          :disabled="busy"
          :label="tr('Sposób zapisu kwot')"
          :options="[
            { value: 'signed', label: tr('Jedna kwota ze znakiem + / −') },
            { value: 'debit-credit', label: tr('Osobno obciążenie i uznanie') },
            { value: 'direction', label: tr('Kwota i kolumna kierunku') },
            { value: 'expense', label: tr('Wszystkie wiersze to wydatki') },
            { value: 'income', label: tr('Wszystkie wiersze to przychody') },
          ]"
          @update:model-value="set('mode', $event)"
      /></label>
      <label class="field"
        ><span>{{ tr("Format daty") }}</span
        ><ChoiceSelect
          :model-value="config.dateFormat"
          :disabled="busy"
          :label="tr('Format daty w CSV')"
          :options="
            [
              'DD.MM.YYYY',
              'YYYY-MM-DD',
              'DD/MM/YYYY',
              'MM/DD/YYYY',
              'DD-MM-YYYY',
              'YYYY/MM/DD',
            ].map((value) => ({ value, label: value }))
          "
          @update:model-value="set('dateFormat', $event)"
      /></label>
      <label class="field"
        ><span>{{ tr("Separator groszy") }}</span
        ><ChoiceSelect
          :model-value="config.decimal"
          :disabled="busy"
          :label="tr('Separator groszy')"
          :options="[
            { value: ',', label: tr('Przecinek: 1 234,56') },
            { value: '.', label: tr('Kropka: 1,234.56') },
          ]"
          @update:model-value="set('decimal', $event)"
      /></label>
      <label v-if="config.mode === 'signed'" class="field"
        ><span>{{ tr("Znak kwoty") }}</span
        ><ChoiceSelect
          :model-value="String(config.negativeIsExpense)"
          :disabled="busy"
          :label="tr('Znak kwoty')"
          :options="[
            { value: 'true', label: tr('Minus = wydatek, plus = wpływ') },
            { value: 'false', label: tr('Plus = wydatek, minus = wpływ') },
          ]"
          @update:model-value="set('negativeIsExpense', $event === 'true')"
      /></label>
      <template v-if="config.mode === 'direction'">
        <label class="field"
          ><span>{{ tr("Wartości oznaczające wydatek") }}</span
          ><input
            :value="config.debitValues"
            :disabled="busy"
            maxlength="500"
            @input="
              set('debitValues', ($event.target as HTMLInputElement).value)
            "
          /><small>{{
            tr("Oddziel średnikiem, np. obciążenie;debit;D")
          }}</small></label
        >
        <label class="field"
          ><span>{{ tr("Wartości oznaczające wpływ") }}</span
          ><input
            :value="config.creditValues"
            :disabled="busy"
            maxlength="500"
            @input="
              set('creditValues', ($event.target as HTMLInputElement).value)
            "
          /><small>{{
            tr("Oddziel średnikiem, np. uznanie;credit;C")
          }}</small></label
        >
      </template>
    </div>
    <p v-if="inspection.ambiguousDate" class="notice small">
      {{
        tr(
          "Daty z ukośnikiem mogą oznaczać dzień/miesiąc albo miesiąc/dzień. Sprawdź wybrany format.",
        )
      }}
    </p>
    <div class="csv-column-map">
      <div v-for="field in fields" :key="field.key" class="csv-map-row">
        <label class="field"
          ><span class="csv-map-label"
            >{{ field.label
            }}<template v-if="field.required"
              ><span class="csv-required" aria-hidden="true"> *</span
              ><span class="sr-only"> {{ tr("(wymagane)") }}</span></template
            ></span
          >
          <ChoiceSelect
            :model-value="
              config.columns[field.key] === undefined
                ? ''
                : String(config.columns[field.key])
            "
            :disabled="busy || readChanged"
            :label="tr('Kolumna: {0}', { 0: field.label })"
            :options="[
              {
                value: '',
                label: field.required
                  ? tr('Wybierz kolumnę')
                  : tr('Nie importuj tego pola'),
              },
              ...inspection.headers.map((header, index) => ({
                value: String(index),
                label: `${letter(index)} — ${header || tr('(bez nazwy)')}`,
              })),
            ]"
            @update:model-value="column(field.key, $event)"
          />
        </label>
        <span class="csv-sample"
          ><ArrowRight :size="15" /><span>{{ sample(field.key) }}</span></span
        >
      </div>
    </div>
    <details class="csv-read-settings">
      <summary>{{ tr("Podgląd oryginalnego pliku") }}</summary>
      <div
        class="csv-table-scroll"
        tabindex="0"
        :aria-label="tr('Podgląd danych CSV')"
      >
        <table class="csv-table">
          <thead>
            <tr>
              <th v-for="(header, index) in inspection.headers" :key="index">
                {{ letter(index) }} · {{ header }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in inspection.samples" :key="index">
              <td v-for="(cell, col) in row" :key="col">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
    <div class="section-heading wrap">
      <span class="muted small">{{
        tr("Kwoty rozliczone w PLN · każda operacja osobno")
      }}</span
      ><button
        class="button"
        :disabled="busy || !ready"
        @click="emit('preview')"
      >
        {{ tr("Sprawdź operacje") }} <ArrowRight :size="17" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.csv-mapping h2 {
  display: flex;
  align-items: center;
  gap: 10px;
}
.csv-read-settings {
  margin: 22px 0;
}
.csv-read-settings summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 18px;
}
.csv-formats {
  margin: 24px 0;
}
.csv-column-map {
  width: 100%;
  border-top: 1px solid var(--line);
}
.csv-required {
  color: var(--danger);
  font-weight: 700;
}
.csv-map-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 8px 24px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}
.csv-map-row .field {
  display: contents;
  margin: 0;
}
.csv-map-label {
  grid-column: 1;
  grid-row: 1;
}
.csv-map-row .choice-select {
  grid-column: 1;
  grid-row: 2;
}
.csv-sample {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--muted);
  min-width: 0;
}
.csv-sample svg {
  flex-shrink: 0;
}
.csv-sample span {
  overflow-wrap: anywhere;
}
.csv-table-scroll {
  max-width: 100%;
  overflow: auto;
  max-height: 300px;
}
.csv-table {
  border-collapse: collapse;
  font-size: 12px;
}
.csv-table th,
.csv-table td {
  text-align: left;
  border-bottom: 1px solid var(--line);
  padding: 12px;
  min-width: 140px;
  max-width: 300px;
  overflow-wrap: anywhere;
}
@media (max-width: 600px) {
  .csv-map-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .csv-sample {
    grid-column: 1;
    grid-row: 3;
    padding-left: 4px;
  }
}
</style>
