<script setup lang="ts">
import { tr, translatedError } from "../i18n";
import { computed, nextTick, ref, watch } from "vue";
import ChoiceSelect from "./ChoiceSelect.vue";
import CsvMapping from "./CsvMapping.vue";
import MerchantSelect from "./MerchantSelect.vue";
import {
  activeCsvConfig,
  type CsvConfig,
  type CsvError,
  type CsvInspection,
  type CsvTemplate,
} from "./csv";
import {
  Upload,
  FileCheck2,
  Check,
  AlertCircle,
  WandSparkles,
} from "@lucide/vue";
import {
  api,
  currency,
  edit,
  kindOptions,
  load,
  message,
  notify,
  shortDate,
  fullDate,
  state,
} from "./store";
interface ImportRow {
  externalId: string;
  date: string;
  amount: string;
  incoming: boolean;
  counterparty: string;
  title: string;
  merchant: string;
  merchantId?: string | null;
  merchantConfirmed?: boolean;
  categoryId: string | null;
  kind: string;
  skip: boolean;
  excludedFromBudget: boolean;
  duplicate: boolean;
  confidence: string;
  reason: string;
  manualMatchId?: string;
  sourceId?: string | null;
  syntheticId?: boolean;
  allowDuplicate?: boolean;
  rowNumber?: number;
  recipientKey?: string;
  manualCandidates: {
    id: string;
    date: string;
    merchant: string | null;
    description: string | null;
  }[];
}
const file = ref<File | null>(null);
const accountId = ref("");
const rows = ref<ImportRow[]>([]);
const legacyCount = ref(0);
const acknowledgeLegacy = ref(false);
const busy = ref(false);
const error = ref("");
const alert = ref<HTMLElement>();
watch(error, async (value) => {
  if (value) {
    await nextTick();
    alert.value?.scrollIntoView({ block: "center" });
  }
});
const filter = ref("all");
const page = ref(1);
const success = ref(0);
const importedMonth = ref("");
const inspection = ref<CsvInspection | null>(null);
const config = ref<CsvConfig | null>(null);
const templates = ref<CsvTemplate[]>([]);
const templateId = ref("");
const templateName = ref("");
const reviewed = ref(false);
const csvErrors = ref<CsvError[]>([]);
const skipInvalid = ref(false);
const bulkSource = ref("");
const recipientCategories = new Map<string, string>();
const normalizeRecipient = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("pl").replace(/\s+/g, " ").trim();
function recipientKey(row: ImportRow) {
  const recipient = normalizeRecipient(row.counterparty);
  const merchant = normalizeRecipient(row.merchant);
  // An unidentified payment processor can represent unrelated shops.
  if (
    row.confidence !== "high" &&
    /\b(payu|paypro|autopay|przelewy24|paypal)\b/.test(recipient)
  )
    return `${recipient}|${normalizeRecipient(row.title)}`;
  return row.confidence === "high" ? merchant : `${recipient}|${merchant}`;
}
function categoryKey(row: ImportRow) {
  return `${row.kind}|${row.recipientKey}`;
}
function assignMerchant(
  row: ImportRow,
  merchant: { id: string | null; name: string },
) {
  const previous = row.merchant;
  let count = 0;
  for (const candidate of rows.value) {
    if (
      candidate !== row &&
      !candidate.skip &&
      !isDuplicate(candidate) &&
      !candidate.merchantConfirmed &&
      categoryKey(candidate) === categoryKey(row) &&
      candidate.merchant === previous
    ) {
      candidate.merchantId = merchant.id;
      candidate.merchant = merchant.name;
      candidate.confidence = "high";
      candidate.reason = tr("Sklep wybrany dla tego samego odbiorcy");
      count++;
    }
  }
  row.merchantId = merchant.id;
  row.merchant = merchant.name;
  row.merchantConfirmed = true;
  row.confidence = "high";
  row.reason = tr("Wybrany sklep");
  if (count)
    notify(
      tr("Uzupełniono sklep w {0} pozostałych operacjach odbiorcy.", {
        0: count,
      }),
    );
}
function assignRecipientCategory(row: ImportRow) {
  if (
    !row.categoryId ||
    !row.recipientKey ||
    row.kind === "INCOME" ||
    row.kind === "TRANSFER"
  )
    return;
  recipientCategories.set(categoryKey(row), row.categoryId);
  let count = 0;
  for (const candidate of rows.value) {
    if (
      candidate !== row &&
      !candidate.categoryId &&
      !candidate.skip &&
      !isDuplicate(candidate) &&
      categoryKey(candidate) === categoryKey(row)
    ) {
      candidate.categoryId = row.categoryId;
      count++;
    }
  }
  if (count)
    notify(
      tr("Uzupełniono kategorię w {0} pozostałych operacjach tego odbiorcy.", {
        0: count,
      }),
    );
}
function changeSkip(row: ImportRow) {
  if (!row.skip && !row.categoryId && !isDuplicate(row))
    row.categoryId = recipientCategories.get(categoryKey(row)) || null;
}
function changeKind(row: ImportRow) {
  if (row.kind === "TRANSFER") {
    row.skip = true;
    notify(
      tr(
        "Przelew własny pominięty. Możesz włączyć go ponownie, odznaczając Pomiń.",
      ),
    );
  }
}
const readingCurrent = computed(
  () =>
    inspection.value &&
    config.value &&
    ["delimiter", "encoding", "headerRow", "hasHeader"].every(
      (key) =>
        config.value?.[key as keyof CsvConfig] ===
        inspection.value?.config[key as keyof CsvConfig],
    ),
);
const cloneConfig = (value: CsvConfig): CsvConfig =>
  JSON.parse(JSON.stringify(value));
const isDuplicate = (row: ImportRow) =>
  row.duplicate && !(row.syntheticId && row.allowDuplicate);
const selected = computed(() =>
  rows.value.filter((row) => !row.skip && !isDuplicate(row)),
);
const needsReview = (row: ImportRow) =>
  !isDuplicate(row) &&
  !row.skip &&
  ((row.kind === "INCOME" ? !row.sourceId : !row.categoryId) ||
    row.confidence === "low");
const reviewCount = computed(() => rows.value.filter(needsReview).length);
const filtered = computed(() =>
  rows.value.filter(
    (row) =>
      filter.value === "all" ||
      (filter.value === "review" && needsReview(row)) ||
      (filter.value === "duplicates" && row.duplicate),
  ),
);
const visible = computed(() => filtered.value.slice(0, page.value * 40));
const canCommit = computed(
  () =>
    selected.value.length > 0 &&
    selected.value.every(
      (row) =>
        (row.kind === "INCOME" ? row.sourceId : row.categoryId) &&
        row.merchant.trim() &&
        (!row.incoming || ["INCOME", "REFUND", "TRANSFER"].includes(row.kind)),
    ) &&
    (!legacyCount.value || acknowledgeLegacy.value) &&
    (!csvErrors.value.length || skipInvalid.value),
);
function reset() {
  rows.value = [];
  error.value = "";
  legacyCount.value = 0;
  acknowledgeLegacy.value = false;
  success.value = 0;
  page.value = 1;
  filter.value = "all";
  reviewed.value = false;
  csvErrors.value = [];
  skipInvalid.value = false;
  bulkSource.value = "";
  recipientCategories.clear();
}
function chooseFile(event: Event) {
  reset();
  inspection.value = null;
  config.value = null;
  templateId.value = "";
  templateName.value = "";
  file.value = (event.target as HTMLInputElement).files?.[0] || null;
}
function form(input: object = {}) {
  const data = new FormData();
  if (file.value) data.append("file", file.value);
  data.append("accountId", accountId.value);
  data.append("input", JSON.stringify(input));
  return data;
}
async function changeAccount() {
  reset();
  inspection.value = null;
  config.value = null;
  templateId.value = "";
  templateName.value = "";
  templates.value = [];
  if (!accountId.value) return;
  busy.value = true;
  try {
    templates.value = (
      await api.get<CsvTemplate[]>(`csv/${accountId.value}/templates`)
    ).data;
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
async function inspect(reread = false) {
  if (!file.value || !accountId.value) return;
  busy.value = true;
  reset();
  try {
    const response = await api.post<CsvInspection>(
      "csv/inspect",
      form({
        settings:
          reread && config.value
            ? {
                delimiter: config.value.delimiter,
                encoding: config.value.encoding,
                headerRow: config.value.headerRow,
                hasHeader: config.value.hasHeader,
              }
            : undefined,
      }),
    );
    inspection.value = response.data;
    config.value = cloneConfig(response.data.config);
    templateId.value = "";
    const matches = templates.value.filter(
      (t) =>
        JSON.stringify(t.config.headers) ===
        JSON.stringify(response.data.headers),
    );
    if (matches.length === 1 && !reread) {
      config.value = {
        ...cloneConfig(matches[0]!.config),
        delimiter: response.data.config.delimiter,
        encoding: response.data.config.encoding,
        headerRow: response.data.config.headerRow,
        hasHeader: response.data.config.hasHeader,
      };
      templateId.value = matches[0]!.id;
      templateName.value = matches[0]!.name;
    }
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
async function applyTemplate() {
  const template = templates.value.find((t) => t.id === templateId.value);
  if (!template) return;
  busy.value = true;
  error.value = "";
  try {
    const response = await api.post<CsvInspection>(
      "csv/inspect",
      form({ settings: template.config }),
    );
    inspection.value = response.data;
    if (
      JSON.stringify(template.config.headers) !==
      JSON.stringify(response.data.headers)
    ) {
      config.value = cloneConfig(response.data.config);
      templateId.value = "";
      throw new Error(
        tr(
          "Ten szablon ma inny układ kolumn. Dopasuj kolumny do bieżącego pliku.",
        ),
      );
    }
    config.value = cloneConfig(template.config);
    templateName.value = template.name;
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
async function saveTemplate() {
  if (!config.value || !templateName.value.trim()) return;
  if (!readingCurrent.value) {
    error.value = tr("Po zmianie ustawień najpierw odczytaj plik ponownie.");
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const response = await api.post<CsvTemplate>(
      `csv/${accountId.value}/templates`,
      { name: templateName.value, config: activeCsvConfig(config.value) },
    );
    templates.value = (
      await api.get<CsvTemplate[]>(`csv/${accountId.value}/templates`)
    ).data;
    templateId.value = response.data.id;
    notify(tr("Zapisano szablon dla tego konta."));
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
async function deleteTemplate() {
  if (!templateId.value || !confirm(tr("Usunąć wybrany szablon importu?")))
    return;
  busy.value = true;
  try {
    await api.delete(`csv/${accountId.value}/templates/${templateId.value}`);
    templates.value = templates.value.filter((t) => t.id !== templateId.value);
    templateId.value = "";
    templateName.value = "";
    notify(tr("Usunięto szablon."));
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
function assignSource() {
  rows.value.forEach((row) => {
    if (row.kind === "INCOME" && !row.skip && !isDuplicate(row))
      row.sourceId = bulkSource.value || null;
  });
}
async function preview() {
  if (!file.value || !accountId.value || !config.value) return;
  busy.value = true;
  error.value = "";
  success.value = 0;
  try {
    const response = await api.post<{
      rows: ImportRow[];
      legacyCount: number;
      errors: CsvError[];
    }>("csv/preview", form({ config: activeCsvConfig(config.value) }));
    recipientCategories.clear();
    rows.value = response.data.rows.map((row) => ({
      ...row,
      recipientKey: recipientKey(row),
    }));
    legacyCount.value = response.data.legacyCount;
    acknowledgeLegacy.value = false;
    csvErrors.value = response.data.errors;
    skipInvalid.value = false;
    reviewed.value = true;
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
async function commit() {
  if (!canCommit.value) return;
  busy.value = true;
  error.value = "";
  try {
    const data = form({
      config: config.value && activeCsvConfig(config.value),
      skipInvalid: skipInvalid.value,
      acknowledgeLegacy: acknowledgeLegacy.value,
      decisions: rows.value.map((row) => ({
        externalId: row.externalId,
        merchant: row.merchant,
        merchantId: row.merchantId,
        categoryId: row.categoryId,
        kind: row.kind,
        excludedFromBudget: row.excludedFromBudget,
        manualMatchId: row.kind === "INCOME" ? undefined : row.manualMatchId,
        sourceId: row.sourceId,
        allowDuplicate: row.allowDuplicate,
        skip: row.skip || isDuplicate(row),
      })),
    });
    const response = await api.post<{ count: number }>("csv/commit", data);
    if (!response.data.count)
      throw new Error(
        tr("Te operacje są już zapisane. Wczytaj podgląd ponownie."),
      );
    importedMonth.value =
      rows.value
        .map((row) => row.date.slice(0, 7))
        .sort()
        .at(-1) || "";
    success.value = response.data.count;
    rows.value = [];
    reviewed.value = false;
    inspection.value = null;
    notify(tr("Zapisano {0} operacji.", { 0: success.value }));
    await load();
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="page-stack">
    <ol class="csv-steps" :aria-label="tr('Etapy importu')">
      <li :class="{ active: !inspection && !success }">
        {{ tr("1 · Wybierz plik") }}
      </li>
      <li :class="{ active: inspection && !reviewed }">
        {{ tr("2 · Dopasuj kolumny") }}
      </li>
      <li :class="{ active: reviewed || success }">
        {{ tr("3 · Sprawdź i zapisz") }}
      </li>
    </ol>
    <section class="card import-intro">
      <div class="section-heading">
        <h2>{{ tr("Wyciąg bankowy, czytelna historia") }}</h2>
        <Upload :size="23" class="muted" />
      </div>
      <p class="muted">
        {{
          tr(
            "CSV z dowolnego banku lub arkusza · do 5 MB i 5000 operacji · PLN. Dopasuj kolumny raz i zapisz szablon dla wybranego konta. Wydatki i przychody pozostają osobnymi wpisami.",
          )
        }}
      </p>
      <div class="two-columns">
        <label class="field"
          ><span>{{ tr("Konto, z którego pochodzi plik") }}</span
          ><ChoiceSelect
            v-model="accountId"
            :label="tr('Konto, z którego pochodzi plik')"
            :placeholder="tr('Wybierz konto')"
            :disabled="busy"
            :options="
              state?.accounts.map((account) => ({
                value: account.id,
                label: account.name,
              })) || []
            "
            @change="changeAccount" /></label
        ><label class="field"
          ><span>{{ tr("Plik CSV") }}</span
          ><input
            type="file"
            accept=".csv,text/csv"
            :disabled="busy"
            @change="chooseFile"
        /></label>
      </div>
      <div class="section-heading wrap">
        <button class="text-button" :disabled="busy" @click="edit('accounts')">
          {{ tr("Dodaj własne konto") }}</button
        ><button
          class="button"
          :disabled="!file || !accountId || busy"
          @click="inspect(false)"
        >
          <Upload :size="17" />{{
            busy ? tr("Przetwarzanie…") : tr("Odczytaj kolumny")
          }}
        </button>
      </div>
    </section>
    <p v-if="error" ref="alert" class="alert" role="alert">{{ error }}</p>
    <template v-if="inspection && config && !reviewed">
      <section class="card">
        <div class="section-heading">
          <h2>{{ tr("Szablony tego konta") }}</h2>
          <button
            v-if="templateId"
            class="text-button danger"
            :disabled="busy"
            @click="deleteTemplate"
          >
            {{ tr("Usuń szablon") }}
          </button>
        </div>
        <div class="two-columns">
          <label class="field"
            ><span>{{ tr("Zapisany układ kolumn") }}</span
            ><ChoiceSelect
              v-model="templateId"
              :label="tr('Szablon importu')"
              :disabled="busy"
              :options="[
                {
                  value: '',
                  label: tr('Automatyczne podpowiedzi / własne mapowanie'),
                },
                ...templates.map((t) => ({ value: t.id, label: t.name })),
              ]"
              @change="applyTemplate"
            /><small v-if="templateId">{{
              tr("Dopasowano szablon. Sprawdź przykładowe wartości poniżej.")
            }}</small
            ><small v-else>{{
              tr("ING i popularne nazwy kolumn rozpoznajemy automatycznie.")
            }}</small></label
          >
          <label class="field"
            ><span>{{ tr("Nazwa szablonu") }}</span
            ><input
              v-model="templateName"
              :disabled="busy"
              maxlength="100"
              :placeholder="tr('np. Wyciąg konta wspólnego')"
          /></label>
        </div>
        <button
          class="text-button"
          :disabled="busy || !templateName.trim()"
          @click="saveTemplate"
        >
          {{ tr("Zapisz / zaktualizuj szablon") }}
        </button>
      </section>
      <CsvMapping
        v-model="config"
        :inspection="inspection"
        :busy="busy"
        @inspect="inspect(true)"
        @preview="preview"
      />
    </template>
    <section v-if="success" class="card empty-state">
      <FileCheck2 :size="42" class="positive-text" />
      <h2>{{ tr("Historia jest już u Was") }}</h2>
      <p>
        {{
          tr(
            "Zapisano {0} nowych operacji. Zestawienia znajdziesz w miesiącach odpowiadających datom transakcji.",
            { 0: success },
          )
        }}
      </p>
      <RouterLink to="/transactions" class="button">{{
        tr("Przejdź do transakcji")
      }}</RouterLink>
      <RouterLink
        :to="{ path: '/recurring', query: { month: importedMonth } }"
        class="text-button"
        >{{ tr("Sprawdź powiązania subskrypcji i stałych opłat") }}</RouterLink
      >
    </section>
    <template v-if="reviewed">
      <div class="section-heading wrap">
        <h2>{{ tr("Sprawdź operacje") }}</h2>
        <button class="text-button" :disabled="busy" @click="reset">
          {{ tr("Wróć do mapowania kolumn") }}
        </button>
      </div>
      <p class="notice small">
        {{
          tr(
            "Wybór kategorii uzupełnia pozostałe nieprzypisane operacje tego samego odbiorcy i rodzaju w tym pliku. Możesz poprawić każdy wpis osobno. Rozpoznane przelewy własne i przeniesienia do gotówki domyślnie pomijamy.",
          )
        }}
      </p>
      <section v-if="csvErrors.length" class="card csv-errors">
        <h2>
          <AlertCircle :size="20" />
          {{ tr("{0} błędnych wierszy", { 0: csvErrors.length }) }}
        </h2>
        <p class="muted small">
          {{
            tr(
              "Popraw plik i wczytaj go ponownie albo świadomie pomiń poniższe wiersze. Nie zostaną zapisane.",
            )
          }}
        </p>
        <details>
          <summary>{{ tr("Pokaż błędy") }}</summary>
          <ul>
            <li v-for="item in csvErrors" :key="item.rowNumber">
              <strong>{{ tr("Wiersz {0}:", { 0: item.rowNumber }) }}</strong>
              {{ translatedError(item.message)
              }}<small>{{ item.cells.join(" · ").slice(0, 240) }}</small>
            </li>
          </ul>
        </details>
        <label class="check-field"
          ><input
            v-model="skipInvalid"
            type="checkbox"
            :disabled="busy"
          /><span>{{
            tr("Pomiń {0} błędnych wierszy i zapisz tylko poprawne.", {
              0: csvErrors.length,
            })
          }}</span></label
        >
      </section>
      <section v-if="legacyCount" class="notice migration-notice">
        <h2>
          <AlertCircle :size="20" />{{
            tr("Ten okres obejmuje starą historię")
          }}
        </h2>
        <p>
          {{
            tr(
              "W bazie jest {0} wcześniejszych wpisów z tego okresu (stare wydatki lub przychody bez identyfikatorów bankowych). Niektóre mogły być sumowane. Nie da się ich bezpiecznie automatycznie dopasować. Import może podwoić kwoty.",
              { 0: legacyCount },
            )
          }}
        </p>
        <label class="check-field"
          ><input v-model="acknowledgeLegacy" type="checkbox" /><span>{{
            tr(
              "Uzgodniłem starą historię i świadomie chcę dopisać te operacje.",
            )
          }}</span></label
        >
      </section>
      <div class="import-summary">
        <div>
          <strong>{{ rows.length }}</strong
          ><small>{{ tr("operacji w pliku") }}</small>
        </div>
        <div>
          <strong>{{ reviewCount }}</strong
          ><small>{{ tr("do sprawdzenia") }}</small>
        </div>
        <div>
          <strong>{{ rows.filter((r) => r.duplicate).length }}</strong
          ><small>{{ tr("powtórzeń / podobnych") }}</small>
        </div>
        <div>
          <strong>{{ selected.length }}</strong
          ><small>{{ tr("do zapisania") }}</small>
        </div>
      </div>
      <p v-if="rows.some((row) => row.syntheticId)" class="notice small">
        {{
          tr(
            "Ten plik zawiera operacje bez identyfikatora bankowego. Podobne wpisy oznaczamy do sprawdzenia. Dwa identyczne zakupy mogą być osobnymi operacjami — możesz świadomie zapisać podobny wpis.",
          )
        }}
      </p>
      <section v-if="rows.some((row) => row.kind === 'INCOME')" class="card">
        <div class="section-heading wrap">
          <h2>{{ tr("Źródło przychodów") }}</h2>
          <button class="text-button" :disabled="busy" @click="edit('sources')">
            {{ tr("Dodaj źródło") }}
          </button>
        </div>
        <div class="two-columns">
          <label class="field"
            ><span>{{ tr("Ustaw dla niepominiętych przychodów") }}</span
            ><ChoiceSelect
              v-model="bulkSource"
              :label="tr('Źródło dla przychodów')"
              :disabled="busy"
              :options="[
                { value: '', label: tr('Wybierz źródło') },
                ...(state?.sources.map((source) => ({
                  value: source.id,
                  label: source.name,
                })) || []),
              ]" /></label
          ><button
            class="button secondary"
            :disabled="busy || !bulkSource"
            @click="assignSource"
          >
            {{ tr("Przypisz źródło") }}
          </button>
        </div>
      </section>
      <div class="section-heading wrap">
        <div class="segmented">
          <button
            :class="{ active: filter === 'all' }"
            @click="
              filter = 'all';
              page = 1;
            "
          >
            {{ tr("Wszystkie") }}</button
          ><button
            :class="{ active: filter === 'review' }"
            @click="
              filter = 'review';
              page = 1;
            "
          >
            {{ tr("Do sprawdzenia") }}</button
          ><button
            :class="{ active: filter === 'duplicates' }"
            @click="
              filter = 'duplicates';
              page = 1;
            "
          >
            {{ tr("Duplikaty") }}
          </button>
        </div>
      </div>
      <section class="import-rows">
        <article
          v-for="row in visible"
          :key="row.externalId"
          :class="[
            'card import-row',
            { skipped: row.skip || isDuplicate(row) },
          ]"
        >
          <div class="section-heading">
            <label class="check-field"
              ><input
                v-model="row.skip"
                type="checkbox"
                :disabled="row.duplicate || busy"
                @change="changeSkip(row)"
              /><span>{{
                row.duplicate
                  ? row.syntheticId
                    ? tr("Podobna operacja — sprawdź")
                    : tr("Już zapisano — pomijamy")
                  : row.kind === "TRANSFER"
                    ? tr("Pomiń przelew własny")
                    : tr("Pomiń")
              }}</span></label
            ><strong
              >{{ row.incoming ? "+" : "−" }}{{ currency(row.amount) }}</strong
            >
          </div>
          <label v-if="row.duplicate && row.syntheticId" class="check-field"
            ><input
              v-model="row.allowDuplicate"
              :disabled="busy"
              type="checkbox"
            /><span>{{
              tr("To osobna operacja — zapisz mimo podobieństwa")
            }}</span></label
          >
          <div class="raw-bank">
            <strong>{{ row.counterparty || tr("Brak odbiorcy") }}</strong>
            <p>{{ row.title }}</p>
            <small
              >{{
                tr("{0} · wiersz {1}", {
                  0: fullDate(row.date),
                  1: row.rowNumber,
                })
              }}<template v-if="!row.syntheticId">
                · {{ row.externalId }}</template
              ></small
            >
          </div>
          <div v-if="!row.skip && !isDuplicate(row)" class="import-fields">
            <label class="field"
              ><span>{{
                row.kind === "INCOME" ? tr("Nadawca") : tr("Sklep / odbiorca")
              }}</span>
              <MerchantSelect
                v-if="row.kind !== 'INCOME'"
                :merchant-id="row.merchantId"
                :name="row.merchant"
                :label="tr('Sklep / odbiorca')"
                :disabled="busy"
                required
                @select="(merchant) => assignMerchant(row, merchant)"
              />
              <input
                v-else
                v-model="row.merchant"
                :aria-label="tr('Sklep / odbiorca')"
                :aria-describedby="`merchant-hint-${encodeURIComponent(row.externalId)}`"
                maxlength="200"
                :disabled="busy"
              /><small
                v-if="row.kind !== 'INCOME'"
                :id="`merchant-hint-${encodeURIComponent(row.externalId)}`"
                >{{
                  tr(
                    "Nazwa do grupowania sklepów w statystykach, np. Lidl. Po imporcie zmienisz ją, edytując wpis w Transakcjach.",
                  )
                }}</small
              ></label
            ><label v-if="row.kind !== 'INCOME'" class="field"
              ><span>{{ tr("Kategoria") }}</span
              ><ChoiceSelect
                v-model="row.categoryId"
                :label="tr('Kategoria')"
                @change="assignRecipientCategory(row)"
                :placeholder="tr('Wybierz kategorię')"
                :disabled="busy"
                :options="
                  state?.categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                    color: category.color,
                  })) || []
                " /></label
            ><label v-else class="field"
              ><span>{{ tr("Źródło przychodu") }}</span
              ><ChoiceSelect
                v-model="row.sourceId"
                :label="tr('Źródło przychodu')"
                :disabled="busy"
                :options="
                  state?.sources.map((source) => ({
                    value: source.id,
                    label: source.name,
                  })) || []
                " /></label
            ><label class="field"
              ><span>{{ tr("Rodzaj operacji") }}</span
              ><ChoiceSelect
                v-model="row.kind"
                :label="tr('Rodzaj operacji')"
                @change="changeKind(row)"
                :disabled="busy"
                :options="
                  [
                    ...kindOptions,
                    { value: 'INCOME', label: tr('Przychód') },
                  ].filter((k) =>
                    row.incoming
                      ? ['INCOME', 'REFUND', 'TRANSFER'].includes(k.value)
                      : !['REFUND', 'INCOME'].includes(k.value),
                  )
                " /></label
            ><label v-if="row.kind !== 'INCOME'" class="check-field"
              ><input
                v-model="row.excludedFromBudget"
                type="checkbox"
                :disabled="busy"
              /><span>{{ tr("Poza limitem") }}</span></label
            >
          </div>
          <label
            v-if="
              !row.skip &&
              !isDuplicate(row) &&
              row.kind !== 'INCOME' &&
              row.manualCandidates.length
            "
            class="field"
          >
            <span>{{ tr("Możliwy wpis dodany wcześniej ręcznie") }}</span>
            <ChoiceSelect
              v-model="row.manualMatchId"
              :label="tr('Możliwy wpis dodany wcześniej ręcznie')"
              :disabled="busy"
              :options="[
                { value: undefined, label: tr('Zapisz jako osobną operację') },
                ...row.manualCandidates.map((candidate) => ({
                  value: candidate.id,
                  label: tr('Połącz: {0} · {1}', {
                    0: shortDate(candidate.date),
                    1:
                      candidate.merchant ||
                      candidate.description ||
                      tr('Wpis ręczny'),
                  }),
                })),
              ]"
            />
            <small>{{
              tr(
                "Ta sama kwota i data w odstępie do 3 dni. Połącz tylko, jeśli to rzeczywiście ten sam zakup — gotówka może być inną operacją.",
              )
            }}</small>
          </label>
          <div class="section-heading wrap small">
            <span
              :class="row.confidence === 'low' ? 'warning-text' : 'muted'"
              >{{ tr(row.reason) }}</span
            ><button
              v-if="!row.duplicate && row.kind !== 'INCOME'"
              class="text-button"
              :disabled="busy"
              @click="
                edit('rules', undefined, {
                  pattern:
                    row.title.match(/(?:[a-z0-9-]+\.)+[a-z]{2,}/i)?.[0] ||
                    row.counterparty,
                  merchant: row.merchant,
                  categoryId: row.categoryId,
                  kind: row.kind,
                })
              "
            >
              <WandSparkles :size="15" />{{ tr("Zapamiętaj regułę") }}
            </button>
          </div>
        </article>
      </section>
      <button
        v-if="visible.length < filtered.length"
        class="button secondary full-width"
        @click="page++"
      >
        {{ tr("Pokaż kolejne operacje") }}
      </button>
      <div class="import-commit card">
        <p>
          {{ tr("{0} operacji do zapisania.", { 0: selected.length }) }}
          <span v-if="!canCommit" class="muted">{{
            tr(
              "Uzupełnij kategorie, nazwy i rodzaje operacji oraz sprawdź ostrzeżenia.",
            )
          }}</span>
        </p>
        <button class="button" :disabled="busy || !canCommit" @click="commit">
          <Check :size="18" />{{
            busy ? tr("Zapisywanie…") : tr("Zapisz operacje")
          }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.csv-steps {
  display: flex;
  gap: 20px;
  list-style: none;
  padding: 0;
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.csv-steps li {
  padding-bottom: 10px;
  border-bottom: 2px solid transparent;
}
.csv-steps .active {
  color: var(--ink);
  font-weight: 650;
  border-color: var(--teal);
}
.csv-errors h2 {
  display: flex;
  align-items: center;
  gap: 10px;
}
.csv-errors details {
  margin: 20px 0;
}
.csv-errors summary {
  cursor: pointer;
  font-size: 13px;
}
.csv-errors ul {
  max-height: 260px;
  overflow: auto;
  padding-left: 20px;
  font-size: 13px;
}
.csv-errors li {
  padding: 8px 0;
  overflow-wrap: anywhere;
}
.csv-errors li small {
  display: block;
  color: var(--muted);
  margin-top: 5px;
}
@media (max-width: 600px) {
  .csv-steps {
    gap: 12px;
    font-size: 10px;
  }
}
</style>
