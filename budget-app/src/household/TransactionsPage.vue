<script setup lang="ts">
import { tr } from "../i18n";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Plus, Search, Upload, Trash2, WandSparkles } from "@lucide/vue";
import { expenseTitle } from "./presentation";
import ChoiceSelect from "./ChoiceSelect.vue";
import { oneOf, viewPreference } from "./view-state";
import {
  currency,
  cents,
  edit,
  kindLabel,
  kindOptions,
  remove,
  shortDate,
  fullDate,
  signedCents,
  state,
  api,
  message,
} from "./store";
import type { AnalyticsReport } from "./features";
const route = useRoute();
const tab = viewPreference(
  "transactions.tab",
  "expenses",
  oneOf("expenses", "incomes"),
);
const search = viewPreference("transactions.search", "");
const category = viewPreference("transactions.category", "");
const kind = viewPreference(
  "transactions.kind",
  "",
  oneOf("", ...kindOptions.value.map((k) => k.value)),
);
const sort = viewPreference(
  "transactions.sort",
  "date-desc",
  oneOf("date-desc", "date-asc", "amount-desc", "amount-asc"),
);
const byAmount = computed(() => sort.value.startsWith("amount-"));
function compareRows(
  a: { id: string; amount: string; date: string },
  b: { id: string; amount: string; date: string },
) {
  const dateOrder = b.date.localeCompare(a.date);
  const amountOrder = cents(a.amount) - cents(b.amount);
  if (byAmount.value && amountOrder)
    return sort.value === "amount-asc" ? amountOrder : -amountOrder;
  return (
    (sort.value === "date-asc" ? -dateOrder : dateOrder) ||
    a.id.localeCompare(b.id)
  );
}
const page = ref(1);
const rangeData = ref<AnalyticsReport | null>(null);
const rangeError = ref("");
const rangeLoading = ref(false);
const ranged = computed(() => Boolean(route.query.from && route.query.to));
let rangeController: AbortController | undefined;
watch(
  () => [route.query.from, route.query.to, route.query.scope],
  async () => {
    rangeController?.abort();
    rangeData.value = null;
    rangeError.value = "";
    rangeLoading.value = false;
    if (!ranged.value) return;
    const request = new AbortController();
    rangeController = request;
    rangeLoading.value = true;
    try {
      const response = await api.get<AnalyticsReport>("analytics", {
        params: {
          from: route.query.from,
          to: route.query.to,
          scope: route.query.scope || "ordinary",
        },
        signal: request.signal,
      });
      if (!request.signal.aborted) rangeData.value = response.data;
    } catch (cause) {
      if (!request.signal.aborted) rangeError.value = message(cause);
    } finally {
      if (!request.signal.aborted) rangeLoading.value = false;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => rangeController?.abort());
const expenseRows = computed(() =>
  ranged.value ? rangeData.value?.expenses || [] : state.value?.expenses || [],
);
const incomeRows = computed(() =>
  ranged.value ? rangeData.value?.incomes || [] : state.value?.incomes || [],
);
watch([search, category, kind, tab, sort], () => {
  page.value = 1;
});
watch(
  () => route.query,
  (query) => {
    if (query.from && query.to) {
      search.value = String(query.q || "");
      category.value = String(query.category || "");
      kind.value = "";
      tab.value = query.tab === "incomes" ? "incomes" : "expenses";
    } else {
      if (query.q !== undefined) search.value = String(query.q);
      if (query.category !== undefined) category.value = String(query.category);
      if (query.tab !== undefined)
        tab.value = query.tab === "incomes" ? "incomes" : "expenses";
    }
  },
  { immediate: true },
);
const filtered = computed(() =>
  expenseRows.value.filter(
    (row) =>
      (!category.value || row.categoryId === category.value) &&
      (!kind.value || row.kind === kind.value) &&
      (!route.query.merchant ||
        (route.query.merchant === tr("Nieprzypisany sprzedawca")
          ? !row.merchant
          : row.merchant === route.query.merchant)) &&
      `${row.merchant || ""} ${row.description || ""} ${row.category.name}`
        .toLocaleLowerCase("pl")
        .includes(search.value.toLocaleLowerCase("pl")),
  ),
);
const filteredTotal = computed(
  () =>
    filtered.value
      .filter((row) => row.kind !== "TRANSFER")
      .reduce((sum, row) => sum + signedCents(row), 0) / 100,
);
const sortedExpenses = computed(() => [...filtered.value].sort(compareRows));
const visible = computed(() => sortedExpenses.value.slice(0, page.value * 40));
const groups = computed(() => {
  if (byAmount.value) return [{ date: "", rows: visible.value }];
  const grouped = new Map<string, typeof visible.value>();
  for (const row of visible.value) {
    const key = row.date.slice(0, 10);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  return [...grouped].map(([date, rows]) => ({ date, rows }));
});
const incomes = computed(() =>
  incomeRows.value
    .filter((row) =>
      `${row.source.name} ${row.description || ""}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
    )
    .sort(compareRows),
);
</script>

<template>
  <div class="page-stack">
    <div v-if="ranged" class="notice">
      {{
        tr("Transakcje z analiz: {0} — {1} · {2}", {
          0: route.query.from,
          1: route.query.to,
          2:
            route.query.scope === "budget"
              ? tr("wydatki w limicie")
              : tr("zwykłe wydatki"),
        })
      }}<template v-if="route.query.merchant">
        · {{ route.query.merchant }}</template
      >.
      <RouterLink to="/transactions" class="text-button">{{
        tr("Wróć do widoku miesiąca")
      }}</RouterLink>
    </div>
    <p v-if="rangeError" class="alert" role="alert">{{ rangeError }}</p>
    <p v-if="rangeLoading" class="muted small" role="status">
      {{ tr("Ładowanie wybranego zakresu…") }}
    </p>
    <div class="section-heading wrap mobile-toolbar">
      <div class="segmented" role="group" :aria-label="tr('Rodzaj transakcji')">
        <button
          :class="{ active: tab === 'expenses' }"
          @click="tab = 'expenses'"
        >
          {{ tr("Wydatki i operacje") }}</button
        ><button
          :class="{ active: tab === 'incomes' }"
          @click="tab = 'incomes'"
        >
          {{ tr("Przychody") }}
        </button>
      </div>
      <RouterLink to="/import" class="button secondary"
        ><Upload :size="17" />{{ tr("Import CSV") }}</RouterLink
      >
    </div>
    <section class="card">
      <div class="filters">
        <label class="search-field"
          ><Search :size="18" /><input
            v-model="search"
            type="search"
            :placeholder="tr('Sklep, opis, kategoria…')"
            :aria-label="tr('Szukaj transakcji')" /></label
        ><ChoiceSelect
          v-if="tab === 'expenses'"
          v-model="category"
          :label="tr('Filtr kategorii')"
          :empty-label="tr('Kategorie')"
          :options="[
            { value: '', label: tr('Wszystkie kategorie') },
            ...(state?.categories.map((item) => ({
              value: item.id,
              label: item.name,
              color: item.color,
            })) || []),
          ]"
        /><ChoiceSelect
          v-if="tab === 'expenses'"
          v-model="kind"
          :label="tr('Filtr rodzaju operacji')"
          :empty-label="tr('Operacje')"
          :options="[
            { value: '', label: tr('Wszystkie operacje') },
            ...kindOptions,
          ]"
        />
        <ChoiceSelect
          v-model="sort"
          :label="tr('Sortowanie transakcji')"
          class="transaction-sort"
          :options="[
            { value: 'date-desc', label: tr('Najnowsze') },
            { value: 'date-asc', label: tr('Najstarsze') },
            { value: 'amount-desc', label: tr('Kwota: od największej') },
            { value: 'amount-asc', label: tr('Kwota: od najmniejszej') },
          ]"
        />
      </div>
      <div class="section-heading">
        <p class="muted small">
          {{
            tab === "expenses"
              ? tr("{0} operacji · {1} bez przelewów własnych", {
                  0: filtered.length,
                  1: currency(filteredTotal),
                })
              : tr("{0} przychodów", { 0: incomes.length })
          }}
        </p>
        <button
          v-if="tab === 'incomes'"
          class="text-button transaction-add"
          @click="edit(tab)"
        >
          <Plus :size="17" />{{
            tab === "incomes" ? tr("Dodaj przychód") : tr("Dodaj wydatek")
          }}
        </button>
      </div>
      <template v-if="tab === 'expenses'"
        ><section v-for="group in groups" :key="group.date" class="day-group">
          <h3 v-if="!byAmount" class="day-label">
            {{ shortDate(group.date) }}
          </h3>
          <div v-for="row in group.rows" :key="row.id" class="transaction-item">
            <button
              class="list-row transaction-row"
              @click="edit('expenses', row)"
            >
              <span
                class="merchant-avatar"
                :style="{ '--category-color': row.category.color || '#497b78' }"
                >{{ (row.merchant || row.category.name).slice(0, 1) }}</span
              ><span class="grow row-copy"
                ><strong class="transaction-title" :title="expenseTitle(row)">{{
                  expenseTitle(row)
                }}</strong
                ><small class="transaction-meta"
                  ><time
                    class="transaction-date"
                    :datetime="row.date.slice(0, 10)"
                    >{{ fullDate(row.date) }}</time
                  ><span aria-hidden="true">·</span
                  ><span
                    >{{ row.category.name
                    }}<template v-if="row.kind !== 'EXPENSE'">
                      · {{ kindLabel(row.kind) }}</template
                    ></span
                  ></small
                ><small v-if="row.chargePayment" class="positive-text">{{
                  tr("Opłata: {0}", { 0: row.chargePayment.charge.name })
                }}</small></span
              ><span class="amount-column"
                ><strong
                  :class="{
                    'positive-text': row.kind === 'REFUND',
                    muted: row.kind === 'TRANSFER',
                  }"
                  >{{
                    row.kind === "REFUND"
                      ? "+"
                      : row.kind === "TRANSFER"
                        ? ""
                        : "−"
                  }}{{ currency(row.amount) }}</strong
                ><small
                  v-if="
                    row.excludedFromBudget || row.category.excludedFromBudget
                  "
                  >{{ tr("Poza limitem") }}</small
                ></span
              >
            </button>
            <div class="row-actions">
              <button
                v-if="row.raw"
                class="icon-button"
                :aria-label="tr('Utwórz regułę dla sprzedawcy')"
                @click="
                  edit('rules', undefined, {
                    pattern:
                      row.raw.title.match(/(?:[a-z0-9-]+\.)+[a-z]{2,}/i)?.[0] ||
                      row.raw.counterparty,
                    merchant: row.merchant,
                    categoryId: row.categoryId,
                    kind: row.kind,
                  })
                "
              >
                <WandSparkles :size="16" /></button
              ><button
                class="icon-button danger"
                :aria-label="tr('Usuń operację')"
                @click="remove('expenses', row.id, tr('operację'))"
              >
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </section>
        <button
          v-if="filtered.length > visible.length"
          class="button secondary full-width"
          @click="page++"
        >
          {{ tr("Pokaż kolejne operacje") }}
        </button>
        <p v-if="!filtered.length" class="empty-inline">
          {{
            tr(
              "Brak operacji dla wybranych filtrów. Dodaj wydatek lub zaimportuj CSV.",
            )
          }}
        </p></template
      >
      <template v-else
        ><div v-for="row in incomes" :key="row.id" class="transaction-item">
          <button
            class="list-row transaction-row"
            @click="edit('incomes', row)"
          >
            <span class="merchant-avatar">+</span
            ><span class="grow row-copy"
              ><strong>{{ row.source.name }}</strong
              ><small class="transaction-meta"
                ><time
                  class="transaction-date"
                  :datetime="row.date.slice(0, 10)"
                  >{{ fullDate(row.date) }}</time
                ><template v-if="row.description">
                  · {{ row.description }}</template
                ></small
              ></span
            ><strong class="positive-text"
              >+{{ currency(row.amount) }}</strong
            ></button
          ><button
            class="icon-button danger"
            :aria-label="tr('Usuń przychód')"
            @click="remove('incomes', row.id, tr('przychód'))"
          >
            <Trash2 :size="16" />
          </button>
        </div>
        <p v-if="!incomes.length" class="empty-inline">
          {{ tr("Dodaj wpływy z Waszych źródeł dochodu.") }}
        </p></template
      >
    </section>
  </div>
</template>
