<script setup lang="ts">
import { tr } from "../i18n";
import { computed, ref } from "vue";
import {
  Plus,
  CreditCard,
  House,
  Pencil,
  Trash2,
  Link2,
  CalendarDays,
  Search,
  Pause,
  Play,
  ExternalLink,
  ChevronDown,
} from "@lucide/vue";
import ChoiceSelect from "./ChoiceSelect.vue";
import PaymentLinker from "./PaymentLinker.vue";
import {
  api,
  cents,
  currency,
  edit,
  load,
  message,
  month,
  notify,
  remove,
  shortDate,
  state,
} from "./store";
import {
  chargeStatus,
  chargeType,
  cycleLabel,
  type RecurringCharge,
} from "./features";
import { expenseTitle } from "./presentation";
import { oneOf, viewPreference } from "./view-state";
const type = viewPreference(
  "recurring.type",
  "all",
  oneOf("all", "SUBSCRIPTION", "FIXED"),
);
const status = viewPreference(
  "recurring.status",
  "ACTIVE",
  oneOf("", "ACTIVE", "PAUSED", "ENDED"),
);
const search = viewPreference("recurring.search", "");
const period = viewPreference(
  "recurring.period",
  "month",
  oneOf("month", "year"),
);
const recurring = computed(() => state.value?.recurring);
const summary = computed(
  () =>
    recurring.value?.totals[
      type.value === "SUBSCRIPTION"
        ? "subscriptions"
        : type.value === "FIXED"
          ? "fixed"
          : "all"
    ],
);
const definitions = computed(() =>
  (recurring.value?.charges || []).filter(
    (charge) =>
      (type.value === "all" || charge.type === type.value) &&
      (!status.value || charge.status === status.value) &&
      `${charge.name} ${charge.notes || ""}`
        .toLocaleLowerCase("pl")
        .includes(search.value.toLocaleLowerCase("pl")),
  ),
);
const chargeFor = (id: string) =>
  recurring.value?.charges.find((charge) => charge.id === id);
const scheduled = computed(
  () =>
    (period.value === "year"
      ? recurring.value?.yearOccurrences
      : recurring.value?.occurrences
    )?.filter(
      (row) =>
        type.value === "all" || chargeFor(row.chargeId)?.type === type.value,
    ) || [],
);
const plannedSum = computed(
  () => scheduled.value.reduce((sum, row) => sum + cents(row.amount), 0) / 100,
);
const confirmed = computed(() =>
  scheduled.value.filter((row) => row.paymentId),
);
const remainingSum = computed(
  () =>
    scheduled.value
      .filter((row) => !row.paymentId)
      .reduce((sum, row) => sum + cents(row.amount), 0) / 100,
);
const suggestions = computed(
  () =>
    recurring.value?.suggestions.filter(
      (row) =>
        type.value === "all" || chargeFor(row.chargeId)?.type === type.value,
    ) || [],
);
const linking = ref<{
  charge: RecurringCharge;
  dueDate: string;
  expenseId?: string;
} | null>(null);
const busy = ref("");
function link(chargeId: string, dueDate: string, expenseId?: string) {
  const charge = chargeFor(chargeId);
  if (charge) linking.value = { charge, dueDate, expenseId };
}
function addExpense(chargeId: string, dueDate: string) {
  const charge = chargeFor(chargeId);
  if (charge)
    edit("expenses", undefined, {
      amount: charge.amount,
      merchant: charge.name,
      description: charge.name,
      categoryId: charge.categoryId || "",
      date: dueDate,
      chargeId,
      dueDate,
    });
}
async function toggle(charge: RecurringCharge) {
  busy.value = charge.id;
  try {
    await api.put(`recurring/${charge.id}`, {
      ...charge,
      anchorDate: charge.anchorDate.slice(0, 10),
      status: charge.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
    });
    await load();
    notify(
      charge.status === "ACTIVE"
        ? tr("Wstrzymano opłatę w prognozie.")
        : tr("Włączono opłatę w prognozie."),
    );
  } catch (cause) {
    notify(message(cause));
  } finally {
    busy.value = "";
  }
}
const paidExpense = (chargeId: string, paymentId: string) =>
  chargeFor(chargeId)?.payments.find((payment) => payment.id === paymentId)
    ?.expense;
</script>

<template>
  <div class="page-stack recurring-page">
    <div class="section-heading wrap mobile-toolbar">
      <div class="segmented" role="group" :aria-label="tr('Rodzaj opłat')">
        <button :class="{ active: type === 'all' }" @click="type = 'all'">
          {{ tr("Wszystkie") }}</button
        ><button
          :class="{ active: type === 'SUBSCRIPTION' }"
          @click="type = 'SUBSCRIPTION'"
        >
          {{ tr("Subskrypcje") }}</button
        ><button :class="{ active: type === 'FIXED' }" @click="type = 'FIXED'">
          {{ tr("Stałe opłaty") }}
        </button>
      </div>
      <button
        class="button"
        @click="
          edit('recurring', undefined, {
            type: type === 'FIXED' ? 'FIXED' : 'SUBSCRIPTION',
          })
        "
      >
        <Plus :size="18" />{{ tr("Dodaj opłatę") }}
      </button>
    </div>
    <div class="feature-stats">
      <section class="card feature-stat">
        <span class="eyebrow">{{ tr("Miesięcznie") }}</span
        ><strong>{{ currency(summary?.monthly) }}</strong
        ><small>{{ tr("Średni koszt aktywnych opłat") }}</small>
      </section>
      <section class="card feature-stat">
        <span class="eyebrow">{{ tr("Rocznie") }}</span
        ><strong>{{ currency(summary?.yearly) }}</strong
        ><small>{{ tr("Roczny ekwiwalent · PLN") }}</small>
      </section>
      <section class="card feature-stat">
        <span class="eyebrow">{{ tr("Wybrany miesiąc") }}</span
        ><strong>{{ currency(summary?.scheduled) }}</strong
        ><small>{{ tr("Planowane płatności w {0}", { 0: month }) }}</small>
      </section>
      <section class="card feature-stat">
        <span class="eyebrow">{{ tr("Najbliższe 30 dni") }}</span
        ><strong>{{ currency(summary?.next30) }}</strong
        ><small>{{ tr("Terminy bez potwierdzonego kosztu") }}</small>
      </section>
    </div>
    <p class="notice">
      {{
        tr(
          "To poglądowy plan. Opłaty nie pomniejszają budżetu. Kosztem jest wyłącznie wydatek z wyciągu lub dodany ręcznie. Roczna usługa za 240 zł to ekwiwalent 20 zł/mies., ale płatność 240 zł w swoim terminie. Wstrzymane i zakończone opłaty nie wchodzą do prognozy.",
        )
      }}
    </p>
    <div
      v-if="type === 'all' && recurring?.charges.length"
      class="charge-breakdown card"
    >
      <div>
        <CreditCard :size="20" /><span class="grow">{{
          tr("Subskrypcje")
        }}</span
        ><strong>{{
          tr("{0} / mies.", {
            0: currency(recurring.totals.subscriptions.monthly),
          })
        }}</strong
        ><small>{{
          tr("{0} / rok", {
            0: currency(recurring.totals.subscriptions.yearly),
          })
        }}</small>
      </div>
      <div>
        <House :size="20" /><span class="grow">{{ tr("Stałe opłaty") }}</span
        ><strong>{{
          tr("{0} / mies.", { 0: currency(recurring.totals.fixed.monthly) })
        }}</strong
        ><small>{{
          tr("{0} / rok", { 0: currency(recurring.totals.fixed.yearly) })
        }}</small>
      </div>
    </div>
    <section v-if="suggestions.length" class="card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">{{ tr("Po imporcie lub wpisie ręcznym") }}</p>
          <h2>{{ tr("Sugestie powiązań · {0}", { 0: month }) }}</h2>
        </div>
        <span class="pill">{{
          tr("{0} do sprawdzenia", { 0: suggestions.length })
        }}</span>
      </div>
      <p class="muted small">
        {{
          tr(
            "Pasują nazwa lub zapisany fragment opisu i data do 21 dni od terminu. Żadne powiązanie nie powstaje automatycznie.",
          )
        }}
      </p>
      <div
        v-for="suggestion in suggestions"
        :key="`${suggestion.chargeId}-${suggestion.dueDate}-${suggestion.expense.id}`"
        class="suggestion-row"
      >
        <span class="grow row-copy"
          ><strong
            >{{ chargeFor(suggestion.chargeId)?.name }} ·
            {{ currency(suggestion.expense.amount) }}</strong
          ><small
            >{{ shortDate(suggestion.expense.date) }} ·
            {{ expenseTitle(suggestion.expense) }}</small
          ><small v-if="suggestion.priceChanged" class="warning-text">{{
            tr("Inna kwota niż w planie")
          }}</small></span
        ><button
          class="button secondary"
          @click="
            link(suggestion.chargeId, suggestion.dueDate, suggestion.expense.id)
          "
        >
          <Link2 :size="16" />{{ tr("Sprawdź") }}
        </button>
      </div>
    </section>
    <section class="card">
      <div class="section-heading wrap">
        <div>
          <p class="eyebrow">{{ tr("Płatności według harmonogramu") }}</p>
          <h2>
            {{
              period === "year"
                ? tr("Rok {0}", { 0: month.slice(0, 4) })
                : tr("Wybrany miesiąc")
            }}
          </h2>
        </div>
        <div
          class="segmented"
          role="group"
          :aria-label="tr('Okres harmonogramu')"
        >
          <button
            :class="{ active: period === 'month' }"
            @click="period = 'month'"
          >
            {{ tr("Miesiąc") }}</button
          ><button
            :class="{ active: period === 'year' }"
            @click="period = 'year'"
          >
            {{ tr("Rok") }}
          </button>
        </div>
      </div>
      <div class="schedule-totals">
        <span
          >{{ tr("Plan") }} <strong>{{ currency(plannedSum) }}</strong></span
        ><span
          >{{ tr("Pozostało bez potwierdzenia") }}
          <strong>{{ currency(remainingSum) }}</strong></span
        ><span
          >{{ tr("Powiązane terminy") }}
          <strong>{{ confirmed.length }} / {{ scheduled.length }}</strong></span
        >
      </div>
      <p class="muted small">
        {{
          tr(
            "Terminy liczymy od pierwszej daty zapisanej w definicji. Brak powiązania nie oznacza, że nie zapłacono. Dla kosztów zmiennych wpisz szacunkową kwotę.",
          )
        }}
      </p>
      <div
        v-for="row in scheduled"
        :key="`${row.chargeId}-${row.dueDate}`"
        class="schedule-row"
      >
        <span class="schedule-date">{{ shortDate(row.dueDate) }}</span
        ><span class="grow row-copy"
          ><strong>{{ chargeFor(row.chargeId)?.name }}</strong
          ><small
            >{{ chargeType(chargeFor(row.chargeId)?.type || "") }} ·
            {{
              row.paymentId ? tr("Potwierdzony wydatek") : tr("Bez powiązania")
            }}</small
          ></span
        ><span class="amount-column"
          ><strong>{{ currency(row.amount) }}</strong
          ><small v-if="row.paymentId">{{
            tr("Faktycznie {0}", {
              0: currency(paidExpense(row.chargeId, row.paymentId)?.amount),
            })
          }}</small></span
        >
        <div v-if="!row.paymentId" class="schedule-actions">
          <button class="text-button" @click="link(row.chargeId, row.dueDate)">
            <Link2 :size="15" />{{ tr("Powiąż wydatek") }}</button
          ><button
            class="text-button"
            @click="addExpense(row.chargeId, row.dueDate)"
          >
            <Plus :size="15" />{{ tr("Dodaj koszt") }}
          </button>
        </div>
        <button
          v-else
          class="text-button danger"
          @click="
            remove(
              'payments',
              row.paymentId,
              tr('powiązanie (wydatek pozostanie w budżecie)'),
            )
          "
        >
          {{ tr("Odłącz") }}
        </button>
      </div>
      <div v-if="!scheduled.length" class="empty-inline">
        <CalendarDays :size="28" />
        <p>{{ tr("Brak zaplanowanych terminów w tym okresie.") }}</p>
      </div>
    </section>
    <div class="section-heading wrap">
      <h2>{{ tr("Wasze opłaty") }}</h2>
      <div class="charge-list-filters">
        <label class="search-field"
          ><Search :size="17" /><input
            v-model="search"
            type="search"
            :aria-label="tr('Szukaj opłaty')"
            :placeholder="tr('Nazwa opłaty…')" /></label
        ><ChoiceSelect
          v-model="status"
          :label="tr('Status opłat')"
          :options="[
            { value: '', label: tr('Wszystkie statusy') },
            { value: 'ACTIVE', label: tr('Aktywne') },
            { value: 'PAUSED', label: tr('Wstrzymane') },
            { value: 'ENDED', label: tr('Zakończone') },
          ]"
        />
      </div>
    </div>
    <div class="two-columns">
      <section
        v-for="charge in definitions"
        :key="charge.id"
        class="card charge-card"
      >
        <div class="section-heading">
          <span class="goal-icon"
            ><House v-if="charge.type === 'FIXED'" :size="23" /><CreditCard
              v-else
              :size="23"
          /></span>
          <div class="row-actions">
            <button
              class="icon-button"
              :aria-label="tr('Edytuj opłatę')"
              @click="edit('recurring', charge)"
            >
              <Pencil :size="17" /></button
            ><button
              class="icon-button"
              :disabled="busy === charge.id"
              :aria-label="
                charge.status === 'ACTIVE'
                  ? tr('Wstrzymaj opłatę')
                  : tr('Włącz opłatę')
              "
              @click="toggle(charge)"
            >
              <Pause v-if="charge.status === 'ACTIVE'" :size="17" /><Play
                v-else
                :size="17"
              /></button
            ><button
              class="icon-button danger"
              :aria-label="tr('Usuń definicję opłaty')"
              @click="
                remove(
                  'recurring',
                  charge.id,
                  tr(
                    'definicję opłaty i jej powiązania (wydatki pozostaną w budżecie)',
                  ),
                )
              "
            >
              <Trash2 :size="17" />
            </button>
          </div>
        </div>
        <div class="section-heading">
          <h2>{{ charge.name }}</h2>
          <span :class="['pill', { positive: charge.status === 'ACTIVE' }]">{{
            chargeStatus(charge.status)
          }}</span>
        </div>
        <p class="charge-amount">
          {{ currency(charge.amount) }}
          <small>{{ cycleLabel(charge.intervalMonths) }}</small>
        </p>
        <div class="balance-row">
          <span>{{ tr("Ekwiwalent miesięczny") }}</span
          ><strong>{{ currency(charge.monthlyEquivalent) }}</strong>
        </div>
        <div class="balance-row">
          <span>{{ tr("Ekwiwalent roczny") }}</span
          ><strong>{{ currency(charge.yearlyEquivalent) }}</strong>
        </div>
        <p class="muted small">
          {{ chargeType(charge.type)
          }}<template v-if="charge.category">
            · {{ charge.category.name }}</template
          ><br />{{
            tr("Najbliższy termin: {0}", {
              0: charge.nextDueDate
                ? `${shortDate(charge.nextDueDate)} ${charge.nextDueDate.slice(0, 4)}`
                : tr("Opłata nieaktywna"),
            })
          }}
        </p>
        <p v-if="charge.notes" class="muted small charge-notes">
          {{ charge.notes }}
        </p>
        <a
          v-if="charge.website"
          :href="charge.website"
          target="_blank"
          rel="noopener noreferrer"
          class="text-button"
          ><ExternalLink :size="15" />{{ tr("Zarządzaj usługą") }}</a
        >
        <details v-if="charge.payments.length" class="limit-details">
          <summary>
            {{ tr("Powiązane wydatki ({0})", { 0: charge.payments.length }) }}
            <ChevronDown :size="17" />
          </summary>
          <div
            v-for="payment in charge.payments"
            :key="payment.id"
            class="linked-payment"
          >
            <button
              class="text-button"
              @click="edit('expenses', payment.expense)"
            >
              {{ shortDate(payment.expense.date) }}
              {{ payment.expense.date.slice(0, 4) }} ·
              {{ currency(payment.expense.amount) }}</button
            ><button
              class="icon-button danger"
              :aria-label="tr('Odłącz wydatek')"
              @click="
                remove(
                  'payments',
                  payment.id,
                  tr('powiązanie (wydatek pozostanie)'),
                )
              "
            >
              <Trash2 :size="16" />
            </button>
          </div>
        </details>
      </section>
    </div>
    <div v-if="!definitions.length" class="card empty-state">
      <CreditCard :size="35" />
      <h2>
        {{
          recurring?.charges.length
            ? tr("Brak opłat dla tych filtrów")
            : tr("Wszystkie stałe zobowiązania w jednym miejscu")
        }}
      </h2>
      <p>
        {{
          tr(
            "Dodaj czynsz, telefon, internet, Spotify lub inne usługi. Miesięczne i roczne podsumowanie pokaże ich wspólny koszt w PLN.",
          )
        }}
      </p>
      <button class="button" @click="edit('recurring')">
        <Plus :size="17" />{{ tr("Dodaj opłatę") }}
      </button>
    </div>
    <PaymentLinker
      v-if="linking"
      :charge="linking.charge"
      :due-date="linking.dueDate"
      :expense-id="linking.expenseId"
      @close="linking = null"
    />
  </div>
</template>
