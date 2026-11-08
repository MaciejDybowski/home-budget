<script setup lang="ts">
import { tr } from "../i18n";
import { computed, onMounted, ref } from "vue";
import { Link2, X } from "@lucide/vue";
import ChoiceSelect from "./ChoiceSelect.vue";
import {
  api,
  currency,
  load,
  message,
  notify,
  shortDate,
  type Expense,
} from "./store";
import { expenseTitle } from "./presentation";
import type { RecurringCharge } from "./features";
const props = defineProps<{
  charge: RecurringCharge;
  dueDate: string;
  expenseId?: string;
}>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const candidates = ref<
  (Expense & { suggested: boolean; priceChanged: boolean })[]
>([]);
const selectedId = ref(props.expenseId || "");
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const selected = computed(() =>
  candidates.value.find((candidate) => candidate.id === selectedId.value),
);
let returnFocus: HTMLElement | null = null;
function close() {
  if (saving.value) return;
  dialog.value?.close();
  returnFocus?.focus();
  emit("close");
}
async function fetchCandidates() {
  loading.value = true;
  error.value = "";
  try {
    const response = await api.get(`recurring/${props.charge.id}/candidates`, {
      params: { dueDate: props.dueDate },
    });
    candidates.value = response.data;
  } catch (cause) {
    error.value = message(cause);
  } finally {
    loading.value = false;
  }
}
async function confirm() {
  if (!selected.value || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    await api.post(`recurring/${props.charge.id}/payments`, {
      expenseId: selectedId.value,
      dueDate: props.dueDate,
    });
    notify(
      tr("Powiązano istniejący wydatek. Budżet nie został naliczony ponownie."),
    );
    saving.value = false;
    close();
    await load();
  } catch (cause) {
    error.value = message(cause);
  } finally {
    saving.value = false;
  }
}
onMounted(() => {
  returnFocus = document.activeElement as HTMLElement;
  dialog.value?.showModal();
  void fetchCandidates();
});
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    aria-labelledby="payment-title"
    @cancel.prevent="close"
    @click="
      (event) => {
        if (event.target === dialog) close();
      }
    "
  >
    <form @submit.prevent="confirm">
      <header class="sheet-header">
        <h2 id="payment-title">{{ tr("Powiąż wydatek") }}</h2>
        <button
          type="button"
          class="icon-button"
          :aria-label="tr('Zamknij powiązanie')"
          :disabled="saving"
          @click="close"
        >
          <X :size="21" />
        </button>
      </header>
      <p class="notice">
        <strong>{{ charge.name }}</strong>
        {{
          tr(
            "· termin {0} {1} · plan {2}. Wybierasz zapisany już koszt — nie tworzymy nowego wydatku.",
            {
              0: shortDate(dueDate),
              1: dueDate.slice(0, 4),
              2: currency(charge.amount),
            },
          )
        }}
      </p>
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <p v-if="loading" class="empty-inline" role="status">
        {{ tr("Szukamy istniejących wydatków…") }}
      </p>
      <template v-else>
        <label class="field"
          ><span>{{ tr("Istniejący wydatek") }}</span
          ><ChoiceSelect
            v-model="selectedId"
            :label="tr('Istniejący wydatek')"
            :disabled="saving"
            :options="
              candidates.map((candidate) => ({
                value: candidate.id,
                label: `${candidate.suggested ? 'Sugestia · ' : ''}${shortDate(candidate.date)} · ${currency(candidate.amount)} · ${expenseTitle(candidate)}`,
              }))
            "
        /></label>
        <p v-if="!candidates.length" class="muted small">
          {{
            tr(
              "Nie znaleziono niepowiązanych wydatków w odstępie do 31 dni od terminu. Zaimportuj wyciąg lub dodaj koszt ręcznie.",
            )
          }}
        </p>
        <div v-if="selected" class="payment-preview">
          <strong>{{ expenseTitle(selected) }}</strong>
          <p>
            {{ shortDate(selected.date) }} · {{ selected.category.name }} ·
            {{ currency(selected.amount) }}
          </p>
          <p v-if="selected.priceChanged" class="warning-text">
            {{
              tr(
                "Rzeczywista kwota różni się od planu o {0}. Potwierdzenie nie zmieni ceny w definicji opłaty.",
                {
                  0: currency(Number(selected.amount) - Number(charge.amount)),
                },
              )
            }}
          </p>
          <p v-if="selected.origin === 'LEGACY'" class="muted">
            {{
              tr(
                "To stary wpis, który mógł być sumowany. Powiąż tylko, jeśli odpowiada tej konkretnej płatności.",
              )
            }}
          </p>
        </div>
      </template>
      <footer class="sheet-footer">
        <button
          type="button"
          class="button secondary"
          :disabled="saving"
          @click="close"
        >
          {{ tr("Anuluj") }}</button
        ><button class="button" :disabled="saving || loading || !selected">
          <Link2 :size="17" />{{
            saving ? tr("Zapisywanie…") : tr("Potwierdź powiązanie")
          }}
        </button>
      </footer>
    </form>
  </dialog>
</template>
