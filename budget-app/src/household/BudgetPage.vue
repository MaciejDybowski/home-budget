<script setup lang="ts">
import { tr } from "../i18n";
import { computed, ref, watch } from "vue";
import { Plus, Target, Pencil, Trash2, ChevronDown } from "@lucide/vue";
import {
  api,
  categoryTotals,
  cents,
  currency,
  edit,
  load,
  message,
  month,
  notify,
  number,
  remove,
  shortDate,
  state,
  totals,
  type Goal,
} from "./store";
const amount = ref("");
const limits = ref<Record<string, string>>({});
const saving = ref(false);
const saveError = ref("");
watch(
  () => state.value?.budget,
  (budget) => {
    amount.value = budget?.amount || "";
    limits.value = { ...budget?.categoryLimits };
  },
  { immediate: true },
);
async function save() {
  saving.value = true;
  saveError.value = "";
  try {
    await api.put(`budgets/${month.value}`, {
      amount: amount.value,
      categoryLimits: limits.value,
    });
    notify(tr("Zapisano plan na wybrany miesiąc."));
    await load();
  } catch (cause) {
    saveError.value = message(cause);
  } finally {
    saving.value = false;
  }
}
function goalStats(goal: Goal) {
  const collected =
    (cents(goal.initialAmount) +
      goal.contributions.reduce((sum, c) => sum + cents(c.amount), 0)) /
    100;
  const remaining = Math.max(0, (cents(goal.target) - cents(collected)) / 100);
  const days = Math.max(
    0,
    (new Date(goal.deadline).getTime() - Date.now()) / 86400000,
  );
  const months = Math.max(1, Math.ceil(days / (365.2425 / 12)));
  return {
    collected,
    remaining,
    pace: remaining / months,
    expired: days === 0,
    progress: Math.min(100, (collected / Number(goal.target)) * 100),
  };
}
const categoryLimitSum = computed(
  () =>
    Object.values(limits.value).reduce((sum, value) => sum + cents(value), 0) /
    100,
);
</script>

<template>
  <div class="page-stack">
    <div class="two-columns">
      <form class="card" @submit.prevent="save">
        <div class="section-heading">
          <h2>{{ tr("Miesięczny plan") }}</h2>
          <span class="pill">{{ tr("Bez przenoszenia limitów") }}</span>
        </div>
        <label class="field"
          ><span>{{ tr("Łączny limit zwykłych wydatków (zł)") }}</span
          ><input
            v-model="amount"
            class="large-input"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            required
            :placeholder="tr('np. 4000')"
        /></label>
        <p class="muted small">
          {{
            tr(
              "Zakupy, rachunki i inne zwykłe wydatki. Nadpłaty kredytu i przelewy własne są osobno. Limity nie blokują zakupów.",
            )
          }}
        </p>
        <details class="limit-details">
          <summary>
            {{ tr("Limity kategorii") }} <ChevronDown :size="17" />
          </summary>
          <div
            v-for="category in state?.categories"
            :key="category.id"
            class="category-limit"
          >
            <label :for="`limit-${category.id}`"
              ><span
                class="category-dot"
                :style="{ background: category.color }"
              />{{ category.name
              }}<small v-if="category.excludedFromBudget">{{
                tr("Poza limitem")
              }}</small></label
            ><input
              :id="`limit-${category.id}`"
              v-model="limits[category.id]"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              :placeholder="tr('Bez limitu')"
              :disabled="category.excludedFromBudget"
            />
          </div>
          <p class="muted small">
            {{
              tr(
                "Suma limitów kategorii: {0}. Limit całkowity jest niezależny.",
                { 0: currency(categoryLimitSum) },
              )
            }}
          </p>
        </details>
        <p v-if="saveError" class="alert" role="alert">{{ saveError }}</p>
        <button class="button full-width" :disabled="saving">
          {{ saving ? tr("Zapisywanie…") : tr("Zapisz plan miesiąca") }}
        </button>
      </form>
      <section class="card">
        <div class="section-heading">
          <h2>{{ tr("Jak nam idzie") }}</h2>
          <Target :size="22" class="muted" />
        </div>
        <div class="balance-row">
          <span>{{ tr("Wydano w limicie") }}</span
          ><strong>{{ currency(totals.spending) }}</strong>
        </div>
        <div class="balance-row">
          <span>{{ tr("Pozostało w planie") }}</span
          ><strong :class="{ 'negative-text': totals.left < 0 }">{{
            state?.budget ? currency(totals.left) : tr("Brak planu")
          }}</strong>
        </div>
        <div
          v-for="category in categoryTotals.filter(
            (c) => c.total || state?.budget?.categoryLimits[c.id],
          )"
          :key="category.id"
          class="budget-category"
        >
          <div class="section-heading">
            <span>{{ category.name }}</span
            ><strong
              >{{ currency(category.total)
              }}<small
                v-if="state?.budget?.categoryLimits[category.id]"
                class="muted"
              >
                /
                {{ currency(state.budget.categoryLimits[category.id]) }}</small
              ></strong
            >
          </div>
          <div
            v-if="Number(state?.budget?.categoryLimits[category.id]) > 0"
            class="budget-track small-track"
          >
            <span
              :class="{
                over:
                  category.total >
                  Number(state?.budget?.categoryLimits[category.id]),
              }"
              :style="{
                width: `${Math.min(100, Math.max(0, (category.total / Number(state?.budget?.categoryLimits[category.id])) * 100))}%`,
                backgroundColor:
                  category.total <=
                  Number(state?.budget?.categoryLimits[category.id])
                    ? category.color
                    : undefined,
              }"
            />
          </div>
        </div>
        <p class="muted small">
          {{ tr("Nadwyżka po wszystkich wydatkach i nadpłatach:") }}
          <strong>{{ currency(totals.surplus) }}</strong
          >{{
            tr(
              ". Niewykorzystany limit to miejsce w planie, a nie dodatkowy przychód.",
            )
          }}
        </p>
      </section>
    </div>
    <div class="section-heading">
      <div>
        <p class="eyebrow">{{ tr("Na to odkładamy") }}</p>
        <h2>{{ tr("Wspólne cele") }}</h2>
      </div>
      <button class="button secondary" @click="edit('goals')">
        <Plus :size="18" />{{ tr("Dodaj cel") }}
      </button>
    </div>
    <p class="muted small">
      {{
        tr(
          "Postęp wynika z potwierdzonych wpłat. Samo przelanie pieniędzy między Waszymi kontami nie tworzy nowej oszczędności.",
        )
      }}
    </p>
    <div class="two-columns">
      <section
        v-for="goal in state?.goals"
        :key="goal.id"
        class="card goal-card"
      >
        <div class="section-heading">
          <span class="goal-icon"><Target :size="24" /></span>
          <div class="row-actions">
            <button
              class="icon-button"
              :aria-label="tr('Edytuj cel')"
              @click="edit('goals', goal)"
            >
              <Pencil :size="17" /></button
            ><button
              class="icon-button danger"
              :aria-label="tr('Usuń cel i potwierdzenia wpłat')"
              @click="
                remove('goals', goal.id, tr('cel wraz z potwierdzeniami wpłat'))
              "
            >
              <Trash2 :size="17" />
            </button>
          </div>
        </div>
        <h2>{{ goal.name }}</h2>
        <p class="goal-amount">
          {{ currency(goalStats(goal).collected) }}
          <small>{{ tr("z {0}", { 0: currency(goal.target) }) }}</small>
        </p>
        <div class="budget-track">
          <span :style="{ width: `${goalStats(goal).progress}%` }" />
        </div>
        <div class="section-heading small muted">
          <span>{{
            tr("Do {0} {1}", {
              0: shortDate(goal.deadline),
              1: goal.deadline.slice(0, 4),
            })
          }}</span
          ><span>{{ number(goalStats(goal).progress, 0) }}%</span>
        </div>
        <p v-if="goalStats(goal).remaining === 0" class="positive-text">
          {{ tr("Cel osiągnięty!") }}
        </p>
        <p v-else-if="goalStats(goal).expired" class="negative-text">
          {{
            tr("Termin minął. Pozostało {0}.", {
              0: currency(goalStats(goal).remaining),
            })
          }}
        </p>
        <p v-else class="muted">
          {{ tr("Do celu potrzeba około") }}
          <strong>{{
            tr("{0} miesięcznie", { 0: currency(goalStats(goal).pace) })
          }}</strong>
          {{ tr("od teraz.") }}
        </p>
        <button
          class="button secondary full-width"
          @click="edit('contributions', undefined, { goalId: goal.id })"
        >
          <Plus :size="17" />{{ tr("Potwierdź odłożoną kwotę") }}
        </button>
        <details v-if="goal.contributions.length" class="limit-details">
          <summary>
            {{ tr("Historia wpłat") }} <ChevronDown :size="17" />
          </summary>
          <div
            v-for="contribution in goal.contributions"
            :key="contribution.id"
            class="list-row"
          >
            <span class="grow"
              >{{ shortDate(contribution.date) }}
              {{ contribution.date.slice(0, 4) }}</span
            ><strong>{{ currency(contribution.amount) }}</strong
            ><button
              class="icon-button danger"
              :aria-label="tr('Usuń potwierdzenie wpłaty')"
              @click="
                remove(
                  'contributions',
                  contribution.id,
                  tr('potwierdzenie wpłaty'),
                )
              "
            >
              <Trash2 :size="16" />
            </button>
          </div>
        </details>
      </section>
    </div>
    <div v-if="!state?.goals.length" class="card empty-state">
      <Target :size="35" />
      <h2>{{ tr("Wspólny cel zaczyna się od planu") }}</h2>
      <p>
        {{
          tr(
            "Na przykład 50 000 zł w sześć miesięcy. Ustalcie kwotę i termin, a potem zapisujcie postępy.",
          )
        }}
      </p>
      <button class="button" @click="edit('goals')">
        {{ tr("Utwórz pierwszy cel") }}
      </button>
    </div>
  </div>
</template>
