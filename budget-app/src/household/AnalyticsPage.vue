<script setup lang="ts">
import { tr, intlLocale } from "../i18n";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ArrowUpRight, ChartNoAxesCombined, ChevronRight } from "@lucide/vue";
import ChoiceSelect from "./ChoiceSelect.vue";
import DateInput from "./DateInput.vue";
import FinanceChart from "./FinanceChart.vue";
import {
  api,
  cents,
  currency,
  message,
  month,
  shortDate,
  state,
  dataRevision,
  edit,
  fullDate,
} from "./store";
import { expenseTitle } from "./presentation";
import type { AnalyticsReport } from "./features";
import { oneOf, viewPreference } from "./view-state";
const router = useRouter();
const range = viewPreference(
  "analytics.range",
  "month",
  oneOf("month", "quarter", "year", "custom"),
);
const overviewScope = viewPreference(
  "analytics.scope",
  "budget",
  oneOf("budget", "ordinary"),
);
const categoryId = viewPreference("analytics.category", "");
const categoryScope = viewPreference(
  "analytics.categoryScope",
  "ordinary",
  oneOf("budget", "ordinary"),
);
const scope = computed({
  get: () => (categoryId.value ? categoryScope.value : overviewScope.value),
  set: (value) => {
    if (categoryId.value) categoryScope.value = value;
    else overviewScope.value = value;
  },
});
const year = computed({
  get: () => month.value.slice(0, 4),
  set: (value) => {
    month.value = `${value}-${month.value.slice(5, 7)}`;
  },
});
const quarter = computed({
  get: () => String(Math.ceil(Number(month.value.slice(5, 7)) / 3)),
  set: (value) => {
    month.value = `${year.value}-${String((Number(value) - 1) * 3 + 1).padStart(2, "0")}`;
  },
});
const years = computed(() => {
  const current = new Date().getFullYear();
  const first = Math.min(current - 15, Number(year.value));
  const last = Math.max(current + 2, Number(year.value));
  return Array.from({ length: last - first + 1 }, (_, index) => ({
    value: String(last - index),
    label: String(last - index),
  }));
});
const selectedCategory = computed(() =>
  state.value?.categories.find((category) => category.id === categoryId.value),
);
const expensePage = ref(1);
const categoryExpenses = computed(() => report.value?.expenses || []);
const visibleExpenses = computed(() =>
  categoryExpenses.value.slice(0, expensePage.value * 40),
);
const customFrom = viewPreference("analytics.from", `${month.value}-01`);
const customTo = viewPreference(
  "analytics.to",
  new Date(
    Date.UTC(
      Number(month.value.slice(0, 4)),
      Number(month.value.slice(5, 7)),
      0,
    ),
  )
    .toISOString()
    .slice(0, 10),
);
const tab = viewPreference(
  "analytics.tab",
  "summary",
  oneOf("summary", "categories", "shops"),
);
const report = ref<AnalyticsReport | null>(null);
const loading = ref(false);
const error = ref("");
let controller: AbortController | undefined;
const bounds = computed(() => {
  if (range.value === "custom")
    return { from: customFrom.value, to: customTo.value };
  const year = Number(month.value.slice(0, 4));
  const selectedMonth = Number(month.value.slice(5, 7)) - 1;
  const startMonth =
    range.value === "year"
      ? 0
      : range.value === "quarter"
        ? Math.floor(selectedMonth / 3) * 3
        : selectedMonth;
  const length =
    range.value === "year" ? 12 : range.value === "quarter" ? 3 : 1;
  return {
    from: new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(year, startMonth + length, 0))
      .toISOString()
      .slice(0, 10),
  };
});
async function fetchReport() {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  loading.value = true;
  error.value = "";
  try {
    const response = await api.get<AnalyticsReport>("analytics", {
      params: {
        ...bounds.value,
        scope: scope.value,
        categoryId: categoryId.value || undefined,
      },
      signal: request.signal,
    });
    if (!request.signal.aborted) report.value = response.data;
  } catch (cause) {
    if (!request.signal.aborted) {
      error.value = message(cause);
      report.value = null;
    }
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
watch([bounds, scope, categoryId, dataRevision], fetchReport, {
  immediate: true,
});
watch([bounds, scope, categoryId], () => {
  expensePage.value = 1;
});
onBeforeUnmount(() => controller?.abort());
const monthLabel = (value: string) =>
  new Intl.DateTimeFormat(intlLocale(), {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
const colors = [
  "#286c68",
  "#8daeb5",
  "#de9b68",
  "#947ead",
  "#789b72",
  "#c58383",
  "#8496ac",
];
const series = computed(() => report.value?.series || []);
const positiveCategories = computed(
  () =>
    report.value?.categories.filter((category) => category.amount > 0) || [],
);
const donutCategories = computed(() => {
  const list = positiveCategories.value;
  const first = list.slice(0, 5);
  if (list.length <= 5) return first;
  return [
    ...first,
    {
      id: "other",
      name: tr("Pozostałe"),
      color: "#a4afb7",
      amount:
        list
          .slice(5)
          .reduce((sum, category) => sum + cents(category.amount), 0) / 100,
    },
  ];
});
const donut = computed(() => ({
  labels: donutCategories.value.map((category) => category.name),
  datasets: [
    {
      data: donutCategories.value.map((category) => category.amount),
      backgroundColor: donutCategories.value.map((category) => category.color),
      borderColor: "transparent",
      hoverOffset: 5,
    },
  ],
}));
const comparison = computed(() => ({
  labels: series.value.map((point) => monthLabel(point.month)),
  datasets: [
    {
      label: tr("Przychody domu"),
      data: series.value.map((point) => point.income),
      backgroundColor: "#a6bfc6",
      borderRadius: 5,
    },
    {
      label: tr("Wydatki"),
      data: series.value.map((point) => point.spending),
      backgroundColor: "#286c68",
      borderRadius: 5,
    },
  ],
}));
const categoryTrend = computed(() => ({
  labels: series.value.map((point) => monthLabel(point.month)),
  datasets: [
    {
      label: selectedCategory.value?.name || tr("Wydatki kategorii"),
      data: series.value.map((point) => point.spending),
      backgroundColor: "#286c68",
      borderRadius: 5,
    },
  ],
}));
const line = computed(() => {
  const points = report.value?.daily || [];
  const datasets = [
    {
      label: tr("Wybrany okres"),
      data: points.map((point) => point.spending),
      borderColor: "#286c68",
      backgroundColor: "#286c6812",
      fill: true,
      borderWidth: 2.5,
      tension: 0.25,
      pointRadius: points.length > 31 ? 0 : 2,
    },
    {
      label: tr("Poprzedni okres"),
      data: points.map((point) => point.previous),
      borderColor: "#9baab5",
      backgroundColor: "transparent",
      fill: false,
      borderDash: [5, 5],
      borderWidth: 1.5,
      tension: 0.25,
      pointRadius: 0,
    },
  ];
  if (
    report.value?.completeMonths &&
    series.value.length === 1 &&
    !categoryId.value &&
    scope.value === "budget" &&
    report.value.budgets[0]
  )
    datasets.push({
      label: tr("Limit miesiąca"),
      data: points.map(() => Number(report.value!.budgets[0]!.amount)),
      borderColor: "#c48b59",
      backgroundColor: "transparent",
      fill: false,
      borderDash: [3, 4],
      borderWidth: 1.5,
      tension: 0,
      pointRadius: 0,
    });
  return { labels: points.map((point) => shortDate(point.date)), datasets };
});
const categorySeries = computed(() => ({
  labels: series.value.map((point) => monthLabel(point.month)),
  datasets: (report.value?.categories || []).map((category, index) => ({
    label: category.name,
    data: series.value.map(
      (point) =>
        point.categories.find((item) => item.categoryId === category.id)
          ?.amount || 0,
    ),
    backgroundColor: category.color || colors[index % colors.length],
    borderRadius: 3,
  })),
}));
const shops = computed(() => report.value?.merchants.slice(0, 10) || []);
const merchantChart = computed(() => ({
  labels: shops.value.map((shop) =>
    shop.name.length > 22 ? `${shop.name.slice(0, 22)}…` : shop.name,
  ),
  datasets: [
    {
      label: tr("Wydatki netto"),
      data: shops.value.map((shop) => shop.amount),
      backgroundColor: "#286c68",
      borderRadius: 5,
    },
  ],
}));
const plans = computed(() => {
  if (!report.value?.completeMonths || scope.value !== "budget") return [];
  return (state.value?.categories || [])
    .filter((category) => !categoryId.value || category.id === categoryId.value)
    .flatMap((category) => {
      const monthsWithLimit = report.value!.budgets.filter(
        (budget) => budget.categoryLimits[category.id] != null,
      );
      if (!monthsWithLimit.length || category.excludedFromBudget) return [];
      // Only compare spending in months which actually have a category plan.
      const actual =
        report
          .value!.series.filter((point) =>
            monthsWithLimit.some((budget) => budget.month === point.month),
          )
          .reduce(
            (sum, point) =>
              sum +
              cents(
                point.categories.find((item) => item.categoryId === category.id)
                  ?.amount || 0,
              ),
            0,
          ) / 100;
      const limit =
        monthsWithLimit.reduce(
          (sum, budget) => sum + cents(budget.categoryLimits[category.id]),
          0,
        ) / 100;
      return [{ ...category, actual, limit, months: monthsWithLimit.length }];
    });
});
function transactions(extra: Record<string, string> = {}) {
  router.push({
    path: "/transactions",
    query: {
      ...bounds.value,
      scope: scope.value,
      ...(categoryId.value ? { category: categoryId.value } : {}),
      ...extra,
    },
  });
}
function categoryTransactions(id: string) {
  transactions(id === "other" ? {} : { category: id });
}
function seriesTransactions(index: number, dataset = 1) {
  const point = series.value[index];
  if (!point) return;
  const from =
    `${point.month}-01` > bounds.value.from
      ? `${point.month}-01`
      : bounds.value.from;
  const last = new Date(
    Date.UTC(
      Number(point.month.slice(0, 4)),
      Number(point.month.slice(5, 7)),
      0,
    ),
  )
    .toISOString()
    .slice(0, 10);
  router.push({
    path: "/transactions",
    query: {
      from,
      to: last < bounds.value.to ? last : bounds.value.to,
      scope: scope.value,
      ...(categoryId.value ? { category: categoryId.value } : {}),
      ...(dataset === 0 ? { tab: "incomes" } : {}),
    },
  });
}
function stackedTransactions(index: number, dataset: number) {
  const category = report.value?.categories[dataset];
  if (category) {
    const point = series.value[index];
    if (point)
      router.push({
        path: "/transactions",
        query: {
          from:
            `${point.month}-01` < bounds.value.from
              ? bounds.value.from
              : `${point.month}-01`,
          to:
            new Date(
              Date.UTC(
                Number(point.month.slice(0, 4)),
                Number(point.month.slice(5, 7)),
                0,
              ),
            )
              .toISOString()
              .slice(0, 10) > bounds.value.to
              ? bounds.value.to
              : new Date(
                  Date.UTC(
                    Number(point.month.slice(0, 4)),
                    Number(point.month.slice(5, 7)),
                    0,
                  ),
                )
                  .toISOString()
                  .slice(0, 10),
          scope: scope.value,
          category: category.id,
        },
      });
  }
}
</script>

<template>
  <div class="page-stack analytics-page">
    <section class="card report-controls">
      <div class="report-filter-grid">
        <label class="field"
          ><span>{{ tr("Kategoria") }}</span
          ><ChoiceSelect
            v-model="categoryId"
            :label="tr('Kategoria analizy')"
            :options="[
              { value: '', label: tr('Wszystkie kategorie') },
              ...(state?.categories.map((category) => ({
                value: category.id,
                label: category.name,
                color: category.color,
              })) || []),
            ]"
        /></label>
        <label class="field"
          ><span>{{ tr("Okres") }}</span
          ><ChoiceSelect
            v-model="range"
            :label="tr('Okres analizy')"
            :options="[
              { value: 'month', label: tr('Miesiąc') },
              { value: 'quarter', label: tr('Kwartał') },
              { value: 'year', label: tr('Rok') },
              { value: 'custom', label: tr('Własny zakres') },
            ]" /></label
        ><label v-if="range === 'month'" class="field"
          ><span>{{ tr("Miesiąc") }}</span
          ><DateInput
            v-model="month"
            mode="month"
            :label="tr('Miesiąc odniesienia')"
            required
        /></label>
        <template v-else-if="range === 'quarter' || range === 'year'">
          <label v-if="range === 'quarter'" class="field"
            ><span>{{ tr("Kwartał") }}</span
            ><ChoiceSelect
              v-model="quarter"
              :label="tr('Kwartał analizy')"
              :options="[
                { value: '1', label: tr('I kwartał · styczeń–marzec') },
                { value: '2', label: tr('II kwartał · kwiecień–czerwiec') },
                { value: '3', label: tr('III kwartał · lipiec–wrzesień') },
                { value: '4', label: tr('IV kwartał · październik–grudzień') },
              ]"
          /></label>
          <label class="field"
            ><span>{{ tr("Rok") }}</span
            ><ChoiceSelect
              v-model="year"
              :label="tr('Rok analizy')"
              :options="years"
          /></label> </template
        ><template v-else
          ><label class="field"
            ><span>{{ tr("Od") }}</span
            ><DateInput
              v-model="customFrom"
              :label="tr('Początek analizy')"
              required /></label
          ><label class="field"
            ><span>{{ tr("Do") }}</span
            ><DateInput
              v-model="customTo"
              :label="tr('Koniec analizy')"
              required /></label></template
        ><label class="field"
          ><span>{{ tr("Zakres wydatków") }}</span
          ><ChoiceSelect
            v-model="scope"
            :label="tr('Zakres wydatków')"
            :options="[
              { value: 'budget', label: tr('W limicie budżetu') },
              { value: 'ordinary', label: tr('Wszystkie zwykłe wydatki') },
            ]"
        /></label>
      </div>
      <p class="muted small">
        {{
          tr(
            "{0} — {1} · zwroty pomniejszają wydatki, przelewy własne są pomijane. Kliknij wykres lub zestawienie, aby przejść do transakcji.",
            { 0: fullDate(bounds.from), 1: fullDate(bounds.to) },
          )
        }}
      </p>
    </section>
    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <div v-if="loading" class="loading-state" role="status">
      <span class="loader" />{{ tr("Przygotowywanie analiz…") }}
    </div>
    <template v-else-if="report">
      <div v-if="categoryId" class="category-analysis">
        <section class="card category-summary">
          <p class="eyebrow">{{ tr("Szczegóły kategorii") }}</p>
          <h2>{{ selectedCategory?.name }}</h2>
          <p class="muted small">
            {{ fullDate(bounds.from) }} — {{ fullDate(bounds.to) }}
          </p>
          <div class="category-analysis-total">
            <strong>{{ currency(report.totals.spending) }}</strong
            ><span class="muted small">{{
              tr("Wydatki netto · {0} wpisów", { 0: categoryExpenses.length })
            }}</span>
          </div>
          <p class="muted small">
            {{
              tr("Zakupy pomniejszone o zwroty. {0}", {
                0:
                  scope === "ordinary"
                    ? tr("Uwzględniamy również wydatki poza limitem.")
                    : tr("Tylko wydatki w limicie budżetu."),
              })
            }}
          </p>
          <p
            v-if="scope === 'budget' && selectedCategory?.excludedFromBudget"
            class="notice small"
          >
            {{
              tr(
                "Ta kategoria jest wyłączona z limitu. Wybierz „Wszystkie zwykłe wydatki”, aby zobaczyć jej wydatki.",
              )
            }}
          </p>
          <FinanceChart
            v-if="range === 'month'"
            type="line"
            :data="line"
            :label="tr('Tempo wydatków wybranej kategorii')"
          />
          <FinanceChart
            v-else
            type="bar"
            :data="categoryTrend"
            :label="tr('Wydatki kategorii według miesięcy')"
          />
          <p class="muted small">
            {{
              tr("Poprzedni okres tej samej długości: {0}.", {
                0: currency(report.totals.previous),
              })
            }}
          </p>
          <p v-if="report.legacyCount" class="notice small">
            {{
              tr(
                "{0} wpisów pochodzi ze starej historii i może być agregatami. Liczba wpisów nie oznacza liczby zakupów.",
                { 0: report.legacyCount },
              )
            }}
          </p>
        </section>
        <section class="card category-transactions">
          <div class="section-heading wrap">
            <h2>{{ tr("Transakcje kategorii") }}</h2>
            <button class="text-button" @click="transactions()">
              {{ tr("Otwórz listę") }} <ArrowUpRight :size="16" />
            </button>
          </div>
          <button
            v-for="expense in visibleExpenses"
            :key="expense.id"
            class="list-row transaction-row"
            @click="edit('expenses', expense)"
          >
            <span class="grow row-copy"
              ><strong class="transaction-title">{{
                expenseTitle(expense)
              }}</strong
              ><small
                ><time :datetime="expense.date.slice(0, 10)">{{
                  fullDate(expense.date)
                }}</time
                ><template v-if="expense.merchant">
                  · {{ expense.merchant }}</template
                ><template
                  v-if="
                    expense.excludedFromBudget ||
                    expense.category.excludedFromBudget
                  "
                >
                  {{ tr("· Poza limitem") }}</template
                ></small
              ></span
            >
            <strong :class="{ 'positive-text': expense.kind === 'REFUND' }"
              >{{ expense.kind === "REFUND" ? "+" : "−"
              }}{{ currency(expense.amount) }}</strong
            >
          </button>
          <p v-if="!categoryExpenses.length" class="empty-inline">
            {{ tr("Brak transakcji tej kategorii w wybranym okresie.") }}
          </p>
          <button
            v-if="visibleExpenses.length < categoryExpenses.length"
            class="button secondary full-width"
            @click="expensePage++"
          >
            {{ tr("Pokaż kolejne transakcje") }}
          </button>
        </section>
      </div>
      <template v-else>
        <div class="feature-stats">
          <section class="card feature-stat">
            <span class="eyebrow">{{ tr("Wydatki") }}</span
            ><strong>{{ currency(report.totals.spending) }}</strong
            ><small>{{ tr("Według wybranych filtrów") }}</small>
          </section>
          <section class="card feature-stat">
            <span class="eyebrow">{{ tr("Przychody") }}</span
            ><strong>{{ currency(report.totals.income) }}</strong
            ><small>{{ tr("Wszystkie źródła całego domu") }}</small>
          </section>
          <section class="card feature-stat">
            <span class="eyebrow">{{ tr("Nadwyżka domu") }}</span
            ><strong :class="{ 'negative-text': report.totals.surplus < 0 }">{{
              currency(report.totals.surplus)
            }}</strong
            ><small>{{
              tr(
                "Po wszystkich zwykłych wydatkach i nadpłatach, niezależnie od filtra kategorii",
              )
            }}</small>
          </section>
          <section class="card feature-stat">
            <span class="eyebrow">{{ tr("Zmiana wydatków") }}</span
            ><strong
              :class="
                report.totals.change > 0 ? 'warning-text' : 'positive-text'
              "
              >{{ report.totals.change > 0 ? "+" : ""
              }}{{ currency(report.totals.change) }}</strong
            ><small>{{
              tr("Do poprzedniego okresu o tej samej długości")
            }}</small>
          </section>
        </div>
        <div class="section-heading wrap">
          <div class="segmented" role="group" :aria-label="tr('Widok analiz')">
            <button
              :class="{ active: tab === 'summary' }"
              @click="tab = 'summary'"
            >
              {{ tr("Podsumowanie") }}</button
            ><button
              :class="{ active: tab === 'categories' }"
              @click="tab = 'categories'"
            >
              {{ tr("Kategorie") }}</button
            ><button
              :class="{ active: tab === 'shops' }"
              @click="tab = 'shops'"
            >
              {{ tr("Sklepy") }}
            </button>
          </div>
          <button class="text-button" @click="transactions()">
            {{ tr("Pokaż transakcje") }} <ArrowUpRight :size="17" />
          </button>
        </div>
        <template v-if="tab === 'summary'"
          ><div class="two-columns">
            <section class="card">
              <div class="section-heading">
                <h2>{{ tr("Przychody i wydatki") }}</h2>
                <ChartNoAxesCombined :size="21" class="muted" />
              </div>
              <FinanceChart
                type="bar"
                :data="comparison"
                :label="
                  tr('Miesięczne przychody domu i wydatki według filtrów')
                "
                @select="seriesTransactions"
              />
              <p class="muted small">
                {{
                  tr(
                    "Nadpłaty kredytu osobno: {0}. Przychody dotyczą całego domu.",
                    { 0: currency(report.totals.loan) },
                  )
                }}
              </p>
            </section>
            <section class="card">
              <div class="section-heading">
                <h2>{{ tr("Tempo wydawania") }}</h2>
              </div>
              <FinanceChart
                type="line"
                :data="line"
                :label="
                  tr('Narastające wydatki w wybranym i poprzednim okresie')
                "
                @select="transactions()"
              />
              <p class="muted small">
                {{
                  tr(
                    "Porównanie od {0}. To zapisane operacje, nie prognoza przyszłych wydatków.",
                    { 0: fullDate(report.previousFrom) },
                  )
                }}
              </p>
            </section>
          </div></template
        >
        <template v-if="tab === 'summary' || tab === 'categories'"
          ><section class="card">
            <div class="section-heading">
              <h2>{{ tr("Struktura wydatków") }}</h2>
              <span class="muted small">{{
                tr("Kwoty netto po zwrotach")
              }}</span>
            </div>
            <div v-if="report.categories.length" class="donut-layout">
              <FinanceChart
                v-if="donutCategories.length"
                type="doughnut"
                :data="donut"
                :label="tr('Udział kategorii w dodatnich wydatkach netto')"
                :legend="false"
                @select="
                  (index) => categoryTransactions(donutCategories[index]!.id)
                "
              />
              <p v-else class="empty-inline">
                {{
                  tr(
                    "W tym okresie przeważają zwroty. Salda kategorii pokazujemy obok, bez pierścienia.",
                  )
                }}
              </p>
              <div>
                <button
                  v-for="category in report.categories"
                  :key="category.id"
                  class="list-row"
                  @click="categoryTransactions(category.id)"
                >
                  <span
                    class="category-dot"
                    :style="{ background: category.color }"
                  /><span class="grow">{{ category.name }}</span
                  ><strong>{{ currency(category.amount) }}</strong
                  ><ChevronRight :size="14" />
                </button>
              </div>
            </div>
            <p v-else class="empty-inline">
              {{ tr("Brak dodatnich wydatków w wybranym okresie.") }}
            </p>
            <p
              v-if="report.categories.some((category) => category.amount < 0)"
              class="muted small"
            >
              {{
                tr(
                  "Kategorie z przewagą zwrotów mają ujemne saldo. Są w zestawieniu; pierścień przedstawia tylko dodatnie wartości netto.",
                )
              }}
            </p>
          </section></template
        >
        <template v-if="tab === 'categories'"
          ><section class="card">
            <div class="section-heading">
              <h2>{{ tr("Kategorie w czasie") }}</h2>
            </div>
            <FinanceChart
              type="bar"
              :data="categorySeries"
              :label="tr('Miesięczne wydatki skumulowane według kategorii')"
              stacked
              :legend="false"
              @select="stackedTransactions"
            />
          </section>
          <section class="card">
            <div class="section-heading">
              <h2>{{ tr("Plan a wykonanie") }}</h2>
              <RouterLink to="/budget" class="text-button"
                >{{ tr("Edytuj plan") }} <ChevronRight :size="16"
              /></RouterLink>
            </div>
            <p v-if="scope !== 'budget'" class="muted">
              {{
                tr(
                  "Wybierz zakres „W limicie budżetu”, aby porównać z miesięcznymi założeniami.",
                )
              }}
            </p>
            <p v-else-if="!report.completeMonths" class="muted">
              {{
                tr(
                  "Wybierz pełne miesiące, aby porównać wydatki z miesięcznymi limitami.",
                )
              }}
            </p>
            <p v-else-if="!plans.length" class="muted">
              {{
                tr(
                  "Nie ma limitów kategorii dla tego okresu. Ustaw je w panelu Budżet.",
                )
              }}
            </p>
            <button
              v-for="plan in plans"
              :key="plan.id"
              class="plan-comparison"
              @click="categoryTransactions(plan.id)"
            >
              <span
                >{{ plan.name
                }}<small>{{
                  tr("{0} mies. z zapisanym limitem", { 0: plan.months })
                }}</small></span
              ><strong
                >{{ currency(plan.actual) }} /
                {{ currency(plan.limit) }}</strong
              ><span class="budget-track small-track"
                ><span
                  :class="{ over: plan.actual > plan.limit }"
                  :style="{
                    width: `${plan.limit > 0 ? Math.min(100, Math.max(0, (plan.actual / plan.limit) * 100)) : plan.actual > 0 ? 100 : 0}%`,
                  }"
              /></span>
            </button></section
        ></template>
        <template v-if="tab === 'shops'"
          ><section class="card">
            <div class="section-heading">
              <h2>{{ tr("Gdzie kupujemy") }}</h2>
              <span class="small muted">{{
                tr("10 największych pozycji")
              }}</span>
            </div>
            <FinanceChart
              v-if="shops.length"
              type="bar"
              :data="merchantChart"
              :label="tr('Ranking wydatków netto według sklepów')"
              horizontal
              :legend="false"
              @select="
                (index) => transactions({ merchant: shops[index]!.name })
              "
            />
            <p v-else class="empty-inline">
              {{ tr("Brak wydatków dla wybranych filtrów.") }}
            </p>
          </section>
          <section class="card">
            <button
              v-for="shop in report.merchants"
              :key="shop.name"
              class="list-row"
              @click="transactions({ merchant: shop.name })"
            >
              <span class="grow">{{ shop.name }}</span
              ><strong>{{ currency(shop.amount) }}</strong
              ><ChevronRight :size="15" />
            </button></section
        ></template>
        <p v-if="report.legacyCount" class="notice">
          {{
            tr(
              "Ten zakres zawiera {0} wpisów starej historii. Kwoty są uwzględnione, ale nie wyliczamy liczby zakupów ani wizyt na podstawie zagregowanych danych.",
              { 0: report.legacyCount },
            )
          }}
        </p>
      </template>
    </template>
  </div>
</template>
