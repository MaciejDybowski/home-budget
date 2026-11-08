<script setup lang="ts">
import { tr } from "../i18n";
import { computed } from "vue";
import { viewPreference } from "./view-state";
import ChoiceSelect from "./ChoiceSelect.vue";
import {
  Plus,
  Pencil,
  Trash2,
  Droplets,
  Zap,
  Flame,
  ChevronDown,
} from "@lucide/vue";
import {
  edit,
  month,
  number,
  remove,
  shortDate,
  state,
  type Meter,
} from "./store";
const selected = viewPreference("meters.selected", "");
const filtered = computed(() =>
  (state.value?.meters || []).filter(
    (m) => !selected.value || m.id === selected.value,
  ),
);
function interval(meter: Meter) {
  return meter.intervals
    .filter((i) => i.date.slice(0, 7) <= month.value)
    .at(-1);
}
function lastReading(meter: Meter) {
  return meter.readings.filter((r) => r.date.slice(0, 7) <= month.value).at(-1);
}
function ratio(meter: Meter) {
  return meter.expectedMonthlyUsage
    ? ((interval(meter)?.monthlyPace || 0) / meter.expectedMonthlyUsage) * 100
    : 0;
}
function icon(meter: Meter) {
  return meter.unit === "kWh" ? Zap : meter.unit === "GJ" ? Flame : Droplets;
}
</script>

<template>
  <div class="page-stack">
    <div class="section-heading wrap">
      <p class="muted">
        {{ tr("Miesięczne założenia dla całego domu · 2 osoby") }}
      </p>
      <button class="button secondary" @click="edit('readings')">
        <Plus :size="18" />{{ tr("Dodaj odczyt") }}
      </button>
    </div>
    <p class="notice">
      {{
        tr(
          "Zużycie liczymy między rzeczywistymi odczytami. Tempo miesięczne jest szacunkiem według liczby dni, nie rozliczeniem dostawcy. Limit ogrzewania można skorygować po sprawdzeniu dokumentów.",
        )
      }}
    </p>
    <label class="field compact-field"
      ><span class="sr-only">{{ tr("Wybierz licznik") }}</span
      ><ChoiceSelect
        v-model="selected"
        :label="tr('Wybierz licznik')"
        :options="[
          { value: '', label: tr('Wszystkie liczniki') },
          ...(state?.meters.map((meter) => ({
            value: meter.id,
            label: meter.name,
          })) || []),
        ]"
    /></label>
    <div class="two-columns">
      <section
        v-for="meter in filtered"
        :key="meter.id"
        class="card meter-card"
      >
        <div class="section-heading">
          <span class="meter-icon"
            ><component :is="icon(meter)" :size="24" /></span
          ><button
            class="icon-button"
            :aria-label="tr('Edytuj licznik i limit')"
            @click="edit('meters', meter)"
          >
            <Pencil :size="17" />
          </button>
        </div>
        <h2>{{ meter.name }}</h2>
        <div class="meter-value">
          {{
            interval(meter)?.monthlyPace != null
              ? number(interval(meter)?.monthlyPace)
              : "—"
          }}<small>{{ tr("{0} / miesiąc", { 0: meter.unit }) }}</small>
        </div>
        <div class="section-heading small">
          <span class="muted">{{
            tr("Założenie: {0}", {
              0: meter.expectedMonthlyUsage
                ? tr("{0} {1} / mies.", {
                    0: number(meter.expectedMonthlyUsage),
                    1: meter.unit,
                  })
                : tr("brak"),
            })
          }}</span
          ><span
            v-if="
              interval(meter)?.monthlyPace != null && meter.expectedMonthlyUsage
            "
            :class="['pill', ratio(meter) > 100 ? 'warning' : 'positive']"
            >{{
              ratio(meter) > 100
                ? tr("Ponad założeniem")
                : tr("W ramach założenia")
            }}</span
          >
        </div>
        <div v-if="meter.expectedMonthlyUsage" class="budget-track">
          <span
            :class="{ over: ratio(meter) > 100 }"
            :style="{ width: `${Math.min(100, ratio(meter))}%` }"
          />
        </div>
        <div class="meter-facts">
          <div>
            <small>{{ tr("Zużycie w okresie") }}</small
            ><strong>{{
              interval(meter)?.usage != null
                ? `${number(interval(meter)?.usage)} ${meter.unit}`
                : tr("Potrzeba 2 odczytów")
            }}</strong>
          </div>
          <div>
            <small>{{ tr("Długość okresu") }}</small
            ><strong>{{
              interval(meter)?.days != null
                ? tr("{0} dni", { 0: number(interval(meter)?.days, 0) })
                : "—"
            }}</strong>
          </div>
        </div>
        <p class="muted small">
          {{
            tr("Ostatni odczyt do wybranego miesiąca: {0}.", {
              0: lastReading(meter)
                ? `${shortDate(lastReading(meter)!.date)} · ${number(lastReading(meter)!.value, 3)} ${meter.unit}`
                : tr("brak"),
            })
          }}
        </p>
        <div
          v-if="meter.intervals.length"
          class="meter-chart"
          role="img"
          :aria-label="tr('Historia tempa zużycia: {0}', { 0: meter.name })"
        >
          <div
            v-for="point in meter.intervals.slice(-12)"
            :key="point.date"
            :title="
              tr('{0}: {1} {2}/mies.', {
                0: shortDate(point.date),
                1: number(point.monthlyPace),
                2: meter.unit,
              })
            "
          >
            <span
              :class="{
                over:
                  meter.expectedMonthlyUsage &&
                  (point.monthlyPace || 0) > meter.expectedMonthlyUsage,
              }"
              :style="{
                height: `${Math.max(3, ((point.monthlyPace || 0) / Math.max(...meter.intervals.slice(-12).map((i) => i.monthlyPace || 0), meter.expectedMonthlyUsage || 1)) * 70)}px`,
              }"
            /><small>{{ point.date.slice(5, 7) }}</small>
          </div>
        </div>
        <button
          class="button secondary full-width"
          @click="edit('readings', undefined, { meterTypeId: meter.id })"
        >
          <Plus :size="17" />{{ tr("Dodaj odczyt") }}
        </button>
        <details class="limit-details">
          <summary>
            {{ tr("Historia odczytów") }} <ChevronDown :size="17" />
          </summary>
          <div
            v-for="reading in [...meter.readings].reverse()"
            :key="reading.id"
            class="list-row"
          >
            <span class="grow"
              >{{ shortDate(reading.date) }}
              {{ reading.date.slice(0, 4) }}</span
            ><strong>{{ number(reading.value, 3) }} {{ meter.unit }}</strong
            ><button
              class="icon-button"
              :aria-label="tr('Edytuj odczyt')"
              @click="edit('readings', reading)"
            >
              <Pencil :size="16" /></button
            ><button
              class="icon-button danger"
              :aria-label="tr('Usuń odczyt')"
              @click="remove('readings', reading.id, 'odczyt')"
            >
              <Trash2 :size="16" />
            </button>
          </div>
          <p v-if="!meter.readings.length" class="muted small">
            {{ tr("Dodaj początkowy stan licznika.") }}
          </p>
        </details>
      </section>
    </div>
    <button class="button secondary align-start" @click="edit('meters')">
      <Plus :size="18" />{{ tr("Dodaj licznik") }}
    </button>
  </div>
</template>
