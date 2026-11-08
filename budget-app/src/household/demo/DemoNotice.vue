<script setup lang="ts">
import { tr, locale } from "../../i18n";
import { computed } from "vue";
import { resetDemo } from "./model";
const marketingUrl = computed(
  () => `${import.meta.env.BASE_URL}../${locale.value === "en" ? "en/" : ""}`,
);
function reset() {
  if (
    !window.confirm(
      tr(
        "Przywrócić fikcyjne dane demo? Zmiany w tej przeglądarce zostaną usunięte.",
      ),
    )
  )
    return;
  resetDemo();
  window.location.reload();
}
</script>
<template>
  <div class="demo-notice">
    <span
      ><strong>Demo</strong>
      {{ tr("· Fikcyjne dane. Zmiany zostają w tej przeglądarce.") }}</span
    >
    <div>
      <a :href="marketingUrl">{{ tr("O aplikacji") }}</a
      ><button class="text-button" @click="reset">
        {{ tr("Resetuj demo") }}
      </button>
    </div>
  </div>
</template>
