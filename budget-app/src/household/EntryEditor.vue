<script setup lang="ts">
import { tr } from "../i18n";
import { computed, nextTick, ref, watch } from "vue";
import { X } from "@lucide/vue";
import ChoiceSelect from "./ChoiceSelect.vue";
import DateInput from "./DateInput.vue";
import MerchantSelect from "./MerchantSelect.vue";
import {
  api,
  editor,
  load,
  message,
  notify,
  state,
  shortDate,
  kindLabel,
} from "./store";
const compact = computed(() => editor.entity === "expenses");
const fields = computed(() =>
  editor.fields.filter((field) => !compact.value || !field.advanced),
);
const advancedFields = computed(() =>
  compact.value ? editor.fields.filter((field) => field.advanced) : [],
);
const special = computed(
  () =>
    compact.value &&
    (editor.values.kind !== "EXPENSE" || editor.values.excludedFromBudget),
);
const busy = ref(false);
const error = ref("");
const dialog = ref<HTMLDialogElement>();
let returnFocus: HTMLElement | null = null;
watch(
  () => editor.open,
  async (open) => {
    error.value = "";
    if (open) {
      returnFocus = document.activeElement as HTMLElement;
      await nextTick();
      dialog.value?.showModal();
    } else {
      dialog.value?.close();
      returnFocus?.focus();
    }
  },
);
async function save() {
  busy.value = true;
  error.value = "";
  try {
    const values = Object.fromEntries(
      editor.fields.map((field) => [
        field.key,
        editor.values[field.key] ?? (field.type === "checkbox" ? false : ""),
      ]),
    );
    const endpoint =
      editor.entity === "contributions"
        ? `goals/${editor.values.goalId}/contributions`
        : `${editor.entity}${editor.id ? `/${editor.id}` : ""}`;
    if (editor.entity === "expenses" && editor.values.chargeId) {
      values.chargeId = editor.values.chargeId;
      values.dueDate = editor.values.dueDate;
    }
    if (editor.entity === "expenses")
      values.merchantId = editor.values.merchantId || null;
    await api.request({
      method: editor.id ? "PUT" : "POST",
      url: endpoint,
      data: values,
    });
    editor.open = false;
    notify(tr("Zapisano zmiany."));
    await load();
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    :class="{ 'expense-sheet': compact }"
    aria-labelledby="editor-title"
    @cancel.prevent="!busy && (editor.open = false)"
    @click="
      (event) => {
        if (event.target === dialog && !busy) editor.open = false;
      }
    "
  >
    <form @submit.prevent="save">
      <header class="sheet-header">
        <h2 id="editor-title">{{ editor.title }}</h2>
        <button
          type="button"
          class="icon-button"
          :aria-label="tr('Zamknij')"
          :disabled="busy"
          @click="editor.open = false"
        >
          <X :size="22" />
        </button>
      </header>
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <p v-if="special" class="muted small expense-kind">
        {{ kindLabel(editor.values.kind)
        }}<template v-if="editor.values.excludedFromBudget">
          {{ tr("· Poza miesięcznym limitem") }}</template
        >
      </p>
      <p v-if="editor.entity === 'merchants' && editor.id" class="notice small">
        {{
          tr(
            "Zmiana nazwy obejmie wszystkie transakcje i reguły przypisane do tego sklepu, także w poprzednich miesiącach.",
          )
        }}
      </p>
      <p v-if="editor.entity === 'recurring'" class="notice">
        {{
          tr(
            "To plan w PLN. Sam zapis nie dodaje wydatku ani nie zmienia budżetu. Rzeczywistą płatność powiążesz z wyciągiem lub ręcznie dodanym kosztem.",
          )
        }}
      </p>
      <p
        v-if="editor.entity === 'expenses' && editor.values.chargeId"
        class="notice"
      >
        {{
          tr(
            "Ten nowy koszt zostanie powiązany z opłatą „{0}” za termin {1}. Jeśli wydatek już istnieje, anuluj i wybierz „Powiąż wydatek”.",
            {
              0: state?.recurring?.charges.find(
                (charge) => charge.id === editor.values.chargeId,
              )?.name,
              1: shortDate(editor.values.dueDate),
            },
          )
        }}
      </p>
      <label
        v-for="field in fields"
        :key="field.key"
        :for="`editor-${field.key}`"
        :class="['field', { 'check-field': field.type === 'checkbox' }]"
      >
        <input
          v-if="field.type === 'checkbox'"
          :id="`editor-${field.key}`"
          :aria-label="field.label"
          v-model="editor.values[field.key]"
          type="checkbox"
        />
        <span>{{ field.label }}</span>
        <ChoiceSelect
          v-if="field.type === 'select'"
          :id="`editor-${field.key}`"
          :label="field.label"
          v-model="editor.values[field.key]"
          :required="field.required"
          :options="
            !field.required && field.key === 'categoryId'
              ? [
                  { value: '', label: tr('Bez przypisanej kategorii') },
                  ...(field.options || []),
                ]
              : field.options || []
          "
        />
        <DateInput
          v-else-if="field.type === 'date'"
          :id="`editor-${field.key}`"
          v-model="editor.values[field.key]"
          :label="field.label"
          :required="field.required"
        />
        <MerchantSelect
          v-else-if="field.type === 'merchant'"
          :id="`editor-${field.key}`"
          :merchant-id="editor.values.merchantId"
          :name="editor.values.merchant"
          :label="field.label"
          :disabled="busy"
          @select="
            (merchant) => {
              editor.values.merchantId = merchant.id;
              editor.values.merchant = merchant.name;
            }
          "
        />
        <textarea
          v-else-if="field.type === 'textarea'"
          :id="`editor-${field.key}`"
          :aria-label="field.label"
          v-model="editor.values[field.key]"
          :rows="field.rows || 3"
          :maxlength="field.key === 'patternsText' ? 20000 : 1000"
        />
        <input
          v-else-if="field.type !== 'checkbox'"
          :id="`editor-${field.key}`"
          :aria-label="field.label"
          v-model="editor.values[field.key]"
          :type="field.type || 'text'"
          :required="field.required"
          :step="field.step"
          :min="field.type === 'number' ? 0 : undefined"
          :inputmode="field.type === 'number' ? 'decimal' : undefined"
          :maxlength="
            field.key === 'description' || field.key === 'notes' ? 1000 : 200
          "
        />
        <small v-if="field.hint">{{ field.hint }}</small>
      </label>
      <details
        v-if="advancedFields.length"
        class="editor-advanced"
        :open="special"
      >
        <summary>{{ tr("Dodatkowe ustawienia") }}</summary>
        <label
          v-for="field in advancedFields"
          :key="field.key"
          :class="['field', { 'check-field': field.type === 'checkbox' }]"
        >
          <input
            v-if="field.type === 'checkbox'"
            v-model="editor.values[field.key]"
            type="checkbox"
            :disabled="busy"
            :aria-label="field.label"
          />
          <span>{{ field.label }}</span>
          <ChoiceSelect
            v-if="field.type === 'select'"
            v-model="editor.values[field.key]"
            :options="field.options || []"
            :label="field.label"
            :disabled="busy"
          />
        </label>
      </details>
      <p v-if="editor.entity === 'contributions'" class="muted small">
        {{
          tr(
            "Potwierdzasz faktycznie odłożone pieniądze. Przelew na własne konto oszczędnościowe w imporcie oznacz jako przelew własny.",
          )
        }}
      </p>
      <details
        v-if="editor.entity === 'expenses' && editor.values.raw"
        class="limit-details"
      >
        <summary>{{ tr("Oryginalne dane bankowe") }}</summary>
        <p class="muted small">{{ editor.values.raw.counterparty }}</p>
        <p class="muted small">{{ editor.values.raw.title }}</p>
        <p class="muted small">
          {{ tr("Numer transakcji: {0}", { 0: editor.values.externalId }) }}
        </p>
      </details>
      <footer class="sheet-footer">
        <button
          type="button"
          class="button secondary"
          :disabled="busy"
          @click="editor.open = false"
        >
          {{ tr("Anuluj") }}</button
        ><button class="button" :disabled="busy">
          {{ busy ? tr("Zapisywanie…") : tr("Zapisz") }}
        </button>
      </footer>
    </form>
  </dialog>
</template>
