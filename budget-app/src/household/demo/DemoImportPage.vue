<script setup lang="ts">
import { tr } from "../../i18n";
import { ref } from "vue";
import { Upload, Check, ArrowRight } from "@lucide/vue";
import { api, load, notify, message } from "../store";
const busy = ref(false);
const error = ref("");
async function commit() {
  busy.value = true;
  try {
    const { data } = await api.post("demo/import");
    await load();
    notify(
      data.count
        ? tr("Zaimportowano 3 przykładowe operacje. Sprawdź Transakcje.")
        : tr("Te operacje zostały już zaimportowane. Nie dodano duplikatów."),
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
    <section class="card">
      <div class="section-heading">
        <h2><Upload :size="21" />{{ tr("Od wyciągu do porządku") }}</h2>
      </div>
      <p class="muted">
        {{
          tr(
            "W pełnej aplikacji wybierasz swój CSV, dopasowujesz kolumny i zatwierdzasz operacje. Tutaj możesz przećwiczyć ostatni krok na gotowych, fikcyjnych danych.",
          )
        }}
      </p>
      <p class="notice">
        {{
          tr(
            "To symulacja importu. Nie wgrywaj prawdziwych wyciągów do publicznego demo. Pełny odczyt plików i uczenie reguł są dostępne we własnej instalacji.",
          )
        }}
      </p>
      <div
        v-for="row in [
          [tr('Zielony Market'), tr('Zakupy spożywcze'), tr('86,40 zł')],
          [tr('Piekarnia za rogiem'), tr('Zakupy spożywcze'), tr('19,50 zł')],
          [tr('Miejska Kawa'), tr('Czas dla siebie'), tr('48,00 zł')],
        ]"
        :key="row[0]"
        class="list-row"
      >
        <Check :size="18" /><span class="grow row-copy"
          ><strong>{{ row[0] }}</strong
          ><small>{{ row[1] }}</small></span
        ><strong>{{ row[2] }}</strong>
      </div>
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <button class="button" :disabled="busy" @click="commit">
        {{ busy ? tr("Zapisywanie…") : tr("Zaimportuj 3 przykłady")
        }}<ArrowRight :size="18" />
      </button>
    </section>
    <RouterLink to="/transactions" class="text-button"
      >{{ tr("Przejdź do transakcji") }} <ArrowRight :size="17"
    /></RouterLink>
  </div>
</template>
