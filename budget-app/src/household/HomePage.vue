<script setup lang="ts">
import { tr, intlLocale } from "../i18n";
import { computed } from "vue";
import { expenseTitle } from "./presentation";
import {
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Plus,
  Upload,
  Wallet,
  Gauge,
  ShoppingBag,
} from "@lucide/vue";
import {
  categoryTotals,
  cents,
  currency,
  edit,
  month,
  number,
  shortDate,
  signedCents,
  state,
  totals,
} from "./store";
const progress = computed(() =>
  totals.value.limit > 0
    ? Math.min(
        100,
        Math.max(0, (totals.value.spending / totals.value.limit) * 100),
      )
    : 0,
);
const difference = computed(
  () => totals.value.spending - totals.value.previous,
);
const shops = computed(() => {
  const map = new Map<string, number>();
  for (const row of state.value?.expenses || []) {
    if (!["EXPENSE", "REFUND"].includes(row.kind)) continue;
    const name = row.merchant || tr("Nieprzypisany sprzedawca");
    map.set(name, (map.get(name) || 0) + signedCents(row));
  }
  return [...map]
    .map(([name, amount]) => ({ name, amount: amount / 100 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
});
const hasLegacy = computed(() =>
  state.value?.expenses.some((e) => e.origin === "LEGACY"),
);
const meterAlerts = computed(() =>
  (state.value?.meters || []).map((meter) => ({
    ...meter,
    interval: meter.intervals.at(-1),
  })),
);
const allocations = computed(() =>
  categoryTotals.value.filter((category) => category.total > 0).slice(0, 5),
);
const trend = computed(() =>
  Array.from({ length: 12 }, (_, index) => {
    const key = `${month.value.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`;
    const point = state.value?.trend.find((point) => point.month === key);
    return {
      month: key,
      spending: Number(point?.spending || 0),
      income: Number(point?.income || 0),
      label: new Intl.DateTimeFormat(intlLocale(), {
        month: "short",
        timeZone: "UTC",
      }).format(new Date(`${key}-01T00:00:00Z`)),
    };
  }),
);
const trendMax = computed(() =>
  Math.max(
    1,
    ...trend.value.flatMap((point) => [point.spending, point.income]),
  ),
);
</script>

<template>
  <div class="dashboard-grid">
    <section class="card budget-hero">
      <div class="section-heading">
        <span class="eyebrow">{{ tr("Wydatki w limicie") }}</span
        ><span
          class="pill"
          :class="
            totals.limit && totals.spending > totals.limit
              ? 'warning'
              : 'positive'
          "
          >{{
            !state?.budget
              ? tr("Bez ustawionego limitu")
              : totals.spending > totals.limit
                ? tr("Powyżej planu")
                : tr("W ramach planu")
          }}</span
        >
      </div>
      <div class="hero-amount">{{ currency(totals.spending) }}</div>
      <p v-if="state?.budget" class="muted">
        {{
          tr("z {0} zaplanowanych na ten miesiąc", {
            0: currency(totals.limit),
          })
        }}
      </p>
      <p v-else class="muted">
        {{ tr("Ustalcie wspólny limit i obserwujcie, ile zostaje.") }}
      </p>
      <div
        class="budget-track"
        role="progressbar"
        :aria-valuenow="Math.round(progress)"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="tr('Wykorzystanie miesięcznego limitu')"
      >
        <span
          :style="{ width: `${progress}%` }"
          :class="{ over: totals.spending > totals.limit && totals.limit > 0 }"
        />
      </div>
      <div class="hero-bottom">
        <div>
          <small class="muted">{{
            state?.budget
              ? totals.left >= 0
                ? tr("Pozostało w planie")
                : tr("Ponad plan")
              : tr("Wasz miesięczny plan")
          }}</small
          ><strong>{{
            state?.budget
              ? currency(Math.abs(totals.left))
              : tr("Zacznij od limitu")
          }}</strong>
        </div>
        <RouterLink
          to="/budget"
          class="round-link"
          :aria-label="tr('Przejdź do budżetu')"
          ><ArrowUpRight :size="23"
        /></RouterLink>
      </div>
      <div v-if="totals.previous > 0" class="comparison">
        <component
          :is="difference > 0 ? ArrowUpRight : ArrowDownRight"
          :size="16"
        /><span>{{
          tr("{0} {1} niż w poprzednim miesiącu", {
            0: currency(Math.abs(difference)),
            1: difference > 0 ? tr("więcej") : tr("mniej"),
          })
        }}</span>
      </div>
    </section>
    <section class="card cash-card">
      <div class="section-heading">
        <h2>{{ tr("Pełny obraz") }}</h2>
        <Wallet :size="21" class="muted" />
      </div>
      <div class="balance-row">
        <span>{{ tr("Przychody") }}</span
        ><strong class="positive-text">{{ currency(totals.income) }}</strong>
      </div>
      <div class="balance-row">
        <span>{{ tr("Wszystkie zwykłe wydatki") }}</span
        ><strong>{{ currency(totals.actual) }}</strong>
      </div>
      <div class="balance-row">
        <span>{{ tr("Nadpłaty kredytu") }}</span
        ><strong>{{ currency(totals.loan) }}</strong>
      </div>
      <div class="balance-row separated">
        <span>{{ tr("Nadwyżka po wydatkach") }}</span
        ><strong :class="{ 'negative-text': totals.surplus < 0 }">{{
          currency(totals.surplus)
        }}</strong>
      </div>
      <div class="balance-row">
        <span>{{ tr("Odłożone na cele") }}</span
        ><strong>{{ currency(totals.contributions) }}</strong>
      </div>
      <div class="balance-row">
        <span>{{ tr("Nieprzypisana nadwyżka") }}</span
        ><strong>{{ currency(totals.available) }}</strong>
      </div>
      <p class="muted small">
        {{
          tr("Według zapisanych danych. Ostatni import: {0}.", {
            0: state?.imports[0]
              ? shortDate(state.imports[0].createdAt)
              : tr("jeszcze nie wykonany"),
          })
        }}
      </p>
      <button class="text-button" @click="edit('incomes')">
        <Plus :size="16" />{{ tr("Dodaj przychód") }}
      </button>
    </section>
    <section class="card annual-card">
      <div class="section-heading">
        <h2>{{ tr("Rok {0} w perspektywie", { 0: month.slice(0, 4) }) }}</h2>
        <RouterLink to="/analytics" class="text-button"
          >{{ tr("Zobacz analizy") }} <ArrowUpRight :size="17"
        /></RouterLink>
      </div>
      <div class="annual-chart">
        <button
          v-for="point in trend"
          :key="point.month"
          :aria-label="
            tr('{0}: wydatki {1}, przychody {2}', {
              0: point.label,
              1: currency(point.spending),
              2: currency(point.income),
            })
          "
          :title="
            tr('{0}: wydatki {1}, przychody {2}', {
              0: point.label,
              1: currency(point.spending),
              2: currency(point.income),
            })
          "
          @click="month = point.month"
        >
          <span class="annual-bars"
            ><i
              class="income-bar"
              :style="{ height: `${(point.income / trendMax) * 120}px` }" /><i
              class="spending-bar"
              :style="{
                height: `${(Math.max(0, point.spending) / trendMax) * 120}px`,
              }" /></span
          ><small>{{ point.label }}</small>
        </button>
      </div>
      <div class="chart-legend small muted">
        <span><i class="income-bar" />{{ tr("Przychody") }}</span
        ><span><i class="spending-bar" />{{ tr("Wydatki w limicie") }}</span>
      </div>
    </section>
    <section class="card recurring-overview">
      <div class="section-heading">
        <h2>{{ tr("Subskrypcje i stałe opłaty") }}</h2>
        <RouterLink to="/recurring" class="text-button"
          >{{ tr("Wszystkie") }} <ChevronRight :size="16"
        /></RouterLink>
      </div>
      <div class="recurring-home-totals">
        <div>
          <small>{{ tr("Miesięczny ekwiwalent") }}</small
          ><strong>{{ currency(state?.recurring?.totals.all.monthly) }}</strong>
        </div>
        <div>
          <small>{{ tr("Roczny ekwiwalent") }}</small
          ><strong>{{ currency(state?.recurring?.totals.all.yearly) }}</strong>
        </div>
      </div>
      <p class="muted small">
        {{
          tr(
            "Poglądowy koszt aktywnych opłat. W budżecie liczą się wyłącznie rzeczywiste wydatki.",
          )
        }}
      </p>
      <RouterLink
        v-for="upcoming in state?.recurring?.upcoming.slice(0, 3)"
        :key="`${upcoming.chargeId}-${upcoming.dueDate}`"
        :to="{
          path: '/recurring',
          query: { month: upcoming.dueDate.slice(0, 7) },
        }"
        class="list-row"
        ><span class="grow row-copy"
          ><strong>{{
            state?.recurring?.charges.find(
              (charge) => charge.id === upcoming.chargeId,
            )?.name
          }}</strong
          ><small>{{ shortDate(upcoming.dueDate) }}</small></span
        ><strong>{{ currency(upcoming.amount) }}</strong></RouterLink
      ><RouterLink
        v-if="!state?.recurring?.charges.length"
        to="/recurring"
        class="text-button"
        ><Plus :size="16" />{{
          tr("Dodaj czynsz, usługi i subskrypcje")
        }}</RouterLink
      >
    </section>
    <section class="card">
      <div class="section-heading">
        <h2>{{ tr("Na co wydajemy") }}</h2>
        <RouterLink to="/budget" class="text-button"
          >{{ tr("Plan") }} <ChevronRight :size="16"
        /></RouterLink>
      </div>
      <template v-if="allocations.length"
        ><div class="category-ribbon" aria-hidden="true">
          <span
            v-for="category in allocations"
            :key="category.id"
            :style="{
              flex: cents(category.total),
              background: category.color || '#497b78',
            }"
          />
        </div>
        <RouterLink
          v-for="category in allocations"
          :key="category.id"
          :to="{ path: '/transactions', query: { category: category.id } }"
          class="list-row"
          ><span
            class="category-dot"
            :style="{ background: category.color || '#497b78' }" /><span
            class="grow"
            >{{ category.name }}</span
          ><strong>{{ currency(category.total) }}</strong
          ><ChevronRight :size="15" class="muted" /></RouterLink
      ></template>
      <div v-else class="empty-inline">
        <ShoppingBag :size="28" />
        <p>{{ tr("Tu pojawi się podział Waszych wydatków.") }}</p>
        <button class="text-button" @click="edit('expenses')">
          {{ tr("Dodaj pierwszy wydatek") }}
        </button>
      </div>
    </section>
    <section class="card">
      <div class="section-heading">
        <h2>{{ tr("Ostatnie wydatki") }}</h2>
        <RouterLink to="/transactions" class="text-button"
          >{{ tr("Wszystkie") }} <ChevronRight :size="16"
        /></RouterLink>
      </div>
      <button
        v-for="row in state?.expenses
          .filter((e) => e.kind !== 'TRANSFER')
          .slice(0, 5)"
        :key="row.id"
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
          ><small
            >{{ shortDate(row.date) }} · {{ row.category.name }}</small
          ></span
        ><strong :class="{ 'positive-text': row.kind === 'REFUND' }"
          >{{ row.kind === "REFUND" ? "+" : "−"
          }}{{ currency(row.amount) }}</strong
        >
      </button>
      <div v-if="!state?.expenses.length" class="empty-inline">
        <p>{{ tr("Jeszcze nie ma wydatków w tym miesiącu.") }}</p>
        <RouterLink to="/import" class="text-button"
          ><Upload :size="16" />{{ tr("Importuj CSV") }}</RouterLink
        >
      </div>
    </section>
    <section class="card">
      <div class="section-heading">
        <h2>{{ tr("Gdzie kupujemy") }}</h2>
        <ShoppingBag :size="20" class="muted" />
      </div>
      <RouterLink
        v-for="(shop, index) in shops"
        :key="shop.name"
        :to="{
          path: '/transactions',
          query: {
            q: shop.name === tr('Nieprzypisany sprzedawca') ? '' : shop.name,
          },
        }"
        class="list-row"
        ><span class="ranking-index">{{ index + 1 }}</span
        ><span class="grow">{{ shop.name }}</span
        ><strong>{{ currency(shop.amount) }}</strong></RouterLink
      >
      <p v-if="!shops.length" class="muted small">
        {{ tr("Po imporcie zobaczysz tutaj wydatki według sklepów.") }}
      </p>
      <p v-if="hasLegacy" class="muted small">
        {{
          tr(
            "Stara historia może zawierać sumowane wydatki bez przypisanego sklepu. Ich kwoty pozostają w zestawieniach.",
          )
        }}
      </p>
    </section>
    <section class="card">
      <div class="section-heading">
        <h2>{{ tr("Zużycie w domu") }}</h2>
        <RouterLink to="/meters" class="text-button"
          >{{ tr("Odczyty") }} <ChevronRight :size="16"
        /></RouterLink>
      </div>
      <RouterLink
        v-for="meter in meterAlerts"
        :key="meter.id"
        to="/meters"
        class="list-row"
        ><Gauge :size="20" class="muted" /><span class="grow row-copy"
          ><strong>{{ meter.name }}</strong
          ><small>{{
            meter.interval?.monthlyPace != null
              ? tr("Tempo miesięczne z ostatniego okresu")
              : tr("Dodaj co najmniej dwa odczyty")
          }}</small></span
        ><span
          class="meter-mini"
          :class="{
            'negative-text':
              meter.expectedMonthlyUsage &&
              (meter.interval?.monthlyPace || 0) > meter.expectedMonthlyUsage,
          }"
          >{{
            meter.interval?.monthlyPace != null
              ? `${number(meter.interval.monthlyPace)} ${meter.unit}`
              : "—"
          }}</span
        ></RouterLink
      ><button
        v-if="!state?.meters.length"
        class="text-button"
        @click="edit('meters')"
      >
        {{ tr("Dodaj licznik") }}
      </button>
    </section>
  </div>
</template>
