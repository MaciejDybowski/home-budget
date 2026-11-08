<script setup lang="ts">
import { tr } from "../i18n";
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  ArrowUpRight,
  Smartphone,
  Landmark,
  WandSparkles,
  Layers,
  Banknote,
  Store,
  Merge,
  X,
} from "@lucide/vue";
import { computed, nextTick, ref } from "vue";
import ChoiceSelect from "./ChoiceSelect.vue";
import {
  api,
  edit,
  load,
  message,
  notify,
  remove,
  shortDate,
  state,
  type Merchant,
} from "./store";
const merchantSearch = ref("");
const merchantPage = ref(1);
const merchants = computed(() =>
  (state.value?.merchants || []).filter((m) =>
    m.name
      .toLocaleLowerCase("pl")
      .includes(merchantSearch.value.toLocaleLowerCase("pl")),
  ),
);
const visibleMerchants = computed(() =>
  merchants.value.slice(0, merchantPage.value * 20),
);
const merchantDialog = ref<HTMLDialogElement>();
const selectedMerchant = ref<Merchant>();
const merchantAction = ref<"merge" | "remove">("merge");
const targetId = ref("");
const busy = ref(false);
const error = ref("");
let returnFocus: HTMLElement | null = null;
const mergeOptions = computed(() =>
  (state.value?.merchants || [])
    .filter((merchant) => merchant.id !== selectedMerchant.value?.id)
    .map((merchant) => ({ value: merchant.id, label: merchant.name })),
);
const targetMerchant = computed(() =>
  state.value?.merchants?.find((merchant) => merchant.id === targetId.value),
);
async function openMerchantAction(
  merchant: Merchant,
  action: "merge" | "remove",
) {
  returnFocus = document.activeElement as HTMLElement;
  selectedMerchant.value = merchant;
  merchantAction.value = action;
  targetId.value = "";
  error.value = "";
  await nextTick();
  merchantDialog.value?.showModal();
}
function closeMerchantAction() {
  if (busy.value) return;
  merchantDialog.value?.close();
  returnFocus?.focus();
}
async function applyMerchantAction() {
  if (!selectedMerchant.value || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const endpoint = `merchants/${selectedMerchant.value.id}`;
    if (merchantAction.value === "merge")
      await api.post(`${endpoint}/merge`, { targetId: targetId.value });
    else await api.delete(endpoint);
    await load();
    busy.value = false;
    closeMerchantAction();
    notify(
      merchantAction.value === "merge"
        ? tr("Scalono sklepy.")
        : tr("Usunięto sklep. Transakcje zostały zachowane."),
    );
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="page-stack">
    <div class="two-columns">
      <RouterLink to="/analytics" class="card import-banner"
        ><span class="goal-icon"><ArrowUpRight :size="25" /></span>
        <div class="grow">
          <h2>{{ tr("Analizy") }}</h2>
          <p>{{ tr("Wykresy, kategorie, sklepy i porównania okresów.") }}</p>
        </div>
        <ArrowUpRight :size="21" /></RouterLink
      ><RouterLink to="/recurring" class="card import-banner"
        ><span class="goal-icon"><Banknote :size="25" /></span>
        <div class="grow">
          <h2>{{ tr("Subskrypcje i stałe opłaty") }}</h2>
          <p>{{ tr("Miesięczny i roczny koszt Waszych zobowiązań.") }}</p>
        </div>
        <ArrowUpRight :size="21"
      /></RouterLink>
    </div>
    <RouterLink to="/import" class="card import-banner"
      ><span class="goal-icon"><Upload :size="25" /></span>
      <div class="grow">
        <h2>{{ tr("Import CSV") }}</h2>
        <p>
          {{
            tr("Dopasuj kolumny, sprawdź wydatki i przychody, zapisz operacje.")
          }}
        </p>
      </div>
      <ArrowUpRight :size="24"
    /></RouterLink>
    <section class="card merchant-catalog">
      <div class="section-heading">
        <h2><Store :size="20" />{{ tr("Sklepy") }}</h2>
        <button class="text-button" @click="edit('merchants')">
          <Plus :size="17" />{{ tr("Dodaj sklep") }}
        </button>
      </div>
      <p class="muted small">
        {{
          tr(
            "Wspólny katalog ze wszystkich miesięcy. Poprawienie nazwy aktualizuje ją we wszystkich przypisanych transakcjach i statystykach. Scalanie przenosi powiązania do wybranego sklepu.",
          )
        }}
      </p>
      <label class="field"
        ><span class="sr-only">{{ tr("Szukaj sklepu") }}</span
        ><input
          v-model="merchantSearch"
          type="search"
          :aria-label="tr('Szukaj sklepu')"
          :placeholder="tr('Szukaj w katalogu sklepów…')"
          @input="merchantPage = 1"
      /></label>
      <div
        v-for="merchant in visibleMerchants"
        :key="merchant.id"
        class="list-row"
      >
        <span class="grow row-copy"
          ><strong :title="merchant.name">{{ merchant.name }}</strong
          ><small>{{
            tr("{0} operacji · {1} zapamiętanych dopasowań", {
              0: merchant._count.expenses,
              1: merchant._count.aliases,
            })
          }}</small></span
        >
        <button
          class="icon-button"
          :aria-label="tr('Edytuj sklep: {0}', { 0: merchant.name })"
          @click="edit('merchants', merchant)"
        >
          <Pencil :size="16" />
        </button>
        <button
          class="icon-button"
          :aria-label="tr('Scal sklep: {0}', { 0: merchant.name })"
          :title="tr('Scal z innym sklepem')"
          :disabled="(state?.merchants?.length || 0) < 2"
          @click="openMerchantAction(merchant, 'merge')"
        >
          <Merge :size="16" />
        </button>
        <button
          class="icon-button danger"
          :aria-label="tr('Usuń sklep: {0}', { 0: merchant.name })"
          :title="tr('Usuń sklep')"
          @click="openMerchantAction(merchant, 'remove')"
        >
          <Trash2 :size="16" />
        </button>
      </div>
      <p v-if="!merchants.length" class="empty-inline">
        {{
          tr("Brak sklepów. Dodaj sklep tutaj lub przy zapisywaniu wydatku.")
        }}
      </p>
      <button
        v-if="visibleMerchants.length < merchants.length"
        class="text-button"
        @click="merchantPage++"
      >
        {{ tr("Pokaż kolejne sklepy") }}
      </button>
    </section>
    <div class="two-columns">
      <section class="card">
        <div class="section-heading">
          <h2><Landmark :size="20" />{{ tr("Własne rachunki") }}</h2>
          <button
            class="icon-button"
            :aria-label="tr('Dodaj konto')"
            @click="edit('accounts')"
          >
            <Plus :size="20" />
          </button>
        </div>
        <p class="muted small">
          {{
            tr(
              "Dodaj Wasze konta bankowe i rachunki oszczędnościowe. Numery służą do rozpoznawania przelewów wewnętrznych.",
            )
          }}
        </p>
        <div
          v-for="account in state?.accounts"
          :key="account.id"
          class="list-row"
        >
          <span class="grow row-copy"
            ><strong>{{ account.name }}</strong
            ><small>{{
              account.number
                ? `•••• ${account.number.slice(-4)}`
                : tr("Numer rachunku nieuzupełniony")
            }}</small></span
          ><button
            class="icon-button"
            :aria-label="tr('Edytuj konto')"
            @click="edit('accounts', account)"
          >
            <Pencil :size="16" /></button
          ><button
            class="icon-button danger"
            :aria-label="tr('Usuń konto')"
            @click="remove('accounts', account.id, tr('konto'))"
          >
            <Trash2 :size="16" />
          </button>
        </div>
        <button
          v-if="!state?.accounts.length"
          class="text-button"
          @click="edit('accounts')"
        >
          {{ tr("Dodaj pierwsze konto") }}
        </button>
      </section>
      <section class="card">
        <div class="section-heading">
          <h2><Banknote :size="20" />{{ tr("Źródła przychodów") }}</h2>
          <button
            class="icon-button"
            :aria-label="tr('Dodaj źródło')"
            @click="edit('sources')"
          >
            <Plus :size="20" />
          </button>
        </div>
        <div v-for="source in state?.sources" :key="source.id" class="list-row">
          <span class="grow">{{ source.name }}</span
          ><button
            class="icon-button"
            :aria-label="tr('Edytuj źródło')"
            @click="edit('sources', source)"
          >
            <Pencil :size="16" /></button
          ><button
            class="icon-button danger"
            :aria-label="tr('Usuń źródło')"
            @click="remove('sources', source.id, tr('źródło przychodu'))"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </section>
      <section class="card">
        <div class="section-heading">
          <h2><Layers :size="20" />{{ tr("Kategorie") }}</h2>
          <button
            class="icon-button"
            :aria-label="tr('Dodaj kategorię')"
            @click="edit('categories')"
          >
            <Plus :size="20" />
          </button>
        </div>
        <div
          v-for="category in state?.categories"
          :key="category.id"
          class="list-row"
        >
          <span
            class="category-dot"
            :style="{ background: category.color || '#497b78' }"
          /><span class="grow row-copy"
            ><strong>{{ category.name }}</strong
            ><small v-if="category.excludedFromBudget">{{
              tr("Poza miesięcznym limitem")
            }}</small
            ><small v-if="category.patterns.length">{{
              tr("{0} reguł ze starej aplikacji", {
                0: category.patterns.length,
              })
            }}</small></span
          ><button
            class="icon-button"
            :aria-label="tr('Edytuj kategorię')"
            @click="edit('categories', category)"
          >
            <Pencil :size="16" /></button
          ><button
            class="icon-button danger"
            :aria-label="tr('Usuń kategorię')"
            @click="remove('categories', category.id, tr('kategorię'))"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </section>
      <section class="card">
        <div class="section-heading">
          <h2><WandSparkles :size="20" />{{ tr("Rozpoznawanie sklepów") }}</h2>
          <button
            class="icon-button"
            :aria-label="tr('Dodaj regułę')"
            @click="edit('rules')"
          >
            <Plus :size="20" />
          </button>
        </div>
        <p class="muted small">
          {{
            tr(
              "Twoje reguły mają pierwszeństwo przed wbudowanym słownikiem marek. Najdłuższy pasujący fragment wygrywa.",
            )
          }}
        </p>
        <div v-for="rule in state?.rules" :key="rule.id" class="list-row">
          <span class="grow row-copy"
            ><strong>{{
              rule.merchant || tr("Bez przypisanego sklepu")
            }}</strong
            ><small>{{ rule.pattern }}</small></span
          ><button
            class="icon-button"
            :aria-label="tr('Edytuj regułę')"
            @click="edit('rules', rule)"
          >
            <Pencil :size="16" /></button
          ><button
            class="icon-button danger"
            :aria-label="tr('Usuń regułę')"
            @click="remove('rules', rule.id, tr('regułę'))"
          >
            <Trash2 :size="16" />
          </button>
        </div>
        <button
          v-if="!state?.rules.length"
          class="text-button"
          @click="edit('rules')"
        >
          {{ tr("Utwórz pierwszą regułę") }}
        </button>
      </section>
    </div>
    <section class="card">
      <div class="section-heading">
        <h2>{{ tr("Historia importów") }}</h2>
        <Upload :size="20" class="muted" />
      </div>
      <p class="muted small">
        {{
          tr(
            "Wycofanie importu usuwa wszystkie jego operacje, również później edytowane. Stara historia z migracji nie jest importem CSV.",
          )
        }}
      </p>
      <div v-for="batch in state?.imports" :key="batch.id" class="list-row">
        <span class="grow row-copy"
          ><strong>{{ batch.filename }}</strong
          ><small>{{
            tr("{0} {1} · {2} · {3} operacji", {
              0: shortDate(batch.createdAt),
              1: batch.createdAt.slice(0, 4),
              2: batch.account.name,
              3: batch._count.expenses + (batch._count.incomes || 0),
            })
          }}</small></span
        ><button
          class="text-button danger"
          @click="
            remove(
              'imports',
              batch.id,
              tr('import i wszystkie jego {0} operacji, także edytowane', {
                0: batch._count.expenses + (batch._count.incomes || 0),
              }),
            )
          "
        >
          {{ tr("Wycofaj") }}
        </button>
      </div>
      <p v-if="!state?.imports.length" class="empty-inline">
        {{ tr("Jeszcze nie wykonano importu w nowej wersji.") }}
      </p>
    </section>
    <section class="card install-card">
      <Smartphone :size="28" />
      <div>
        <h2>{{ tr("HomeBudget na ekranie iPhone’a") }}</h2>
        <p class="muted">
          {{
            tr(
              "Otwórz aplikację w Safari, wybierz Udostępnij, a następnie „Do ekranu początkowego”. Aplikacja wymaga domowego połączenia lub VPN i zaufanego HTTPS.",
            )
          }}
        </p>
      </div>
    </section>
    <p class="muted small">
      HomeBudget · © 2026
      <a
        href="https://github.com/MaciejDybowski"
        target="_blank"
        rel="noopener noreferrer"
        >Maciej Dybowski</a
      >
      · MIT ·
      <a
        href="https://github.com/MaciejDybowski/home-budget"
        target="_blank"
        rel="noopener noreferrer"
        >{{ tr("Kod źródłowy") }}</a
      >
    </p>
    <dialog
      ref="merchantDialog"
      class="sheet"
      aria-labelledby="merchant-action-title"
      @cancel.prevent="closeMerchantAction"
      @click="
        (event) => event.target === merchantDialog && closeMerchantAction()
      "
    >
      <form v-if="selectedMerchant" @submit.prevent="applyMerchantAction">
        <header class="sheet-header">
          <h2 id="merchant-action-title">
            {{
              merchantAction === "merge" ? tr("Scal sklepy") : tr("Usuń sklep")
            }}
          </h2>
          <button
            type="button"
            class="icon-button"
            :aria-label="tr('Zamknij')"
            :disabled="busy"
            @click="closeMerchantAction"
          >
            <X :size="22" />
          </button>
        </header>
        <p v-if="error" class="alert" role="alert">{{ error }}</p>
        <p>
          {{ tr("Sklep:") }} <strong>{{ selectedMerchant.name }}</strong>
        </p>
        <template v-if="merchantAction === 'merge'">
          <p class="muted">
            {{
              tr(
                "Wszystkie transakcje ze wszystkich miesięcy, reguły i zapamiętane dopasowania zostaną przeniesione do sklepu docelowego. Definicja „{0}” zostanie usunięta.",
                { 0: selectedMerchant.name },
              )
            }}
          </p>
          <label class="field"
            ><span>{{ tr("Sklep docelowy") }}</span>
            <ChoiceSelect
              v-model="targetId"
              :options="mergeOptions"
              :label="tr('Sklep docelowy')"
              :placeholder="tr('Wybierz sklep docelowy')"
              :disabled="busy"
              required
            />
          </label>
          <p v-if="targetMerchant" class="notice">
            {{ tr("Pozostanie jeden sklep:") }}
            <strong>{{ targetMerchant.name }}</strong
            >.
          </p>
        </template>
        <p v-else class="notice">
          {{
            tr(
              "Transakcje pozostaną z dotychczasowymi kwotami i kategoriami, ale bez przypisanego sklepu. Zapamiętane dopasowania zostaną usunięte. Reguły zachowają kategorię i rodzaj operacji, bez przypisania tego sklepu.",
            )
          }}
        </p>
        <p class="muted small">{{ tr("Tej operacji nie można cofnąć.") }}</p>
        <footer class="sheet-footer">
          <button
            type="button"
            class="button secondary"
            :disabled="busy"
            @click="closeMerchantAction"
          >
            {{ tr("Anuluj") }}
          </button>
          <button
            type="submit"
            class="button"
            :disabled="busy || (merchantAction === 'merge' && !targetId)"
          >
            {{
              busy
                ? tr("Zapisywanie…")
                : merchantAction === "merge"
                  ? tr("Scal sklepy")
                  : tr("Usuń sklep")
            }}
          </button>
        </footer>
      </form>
    </dialog>
  </div>
</template>
