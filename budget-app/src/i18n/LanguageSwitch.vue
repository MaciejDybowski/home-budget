<script setup lang="ts">
import { changeLanguage, locale } from "./index";
</script>
<template>
  <div
    class="language-switch"
    role="group"
    :aria-label="locale === 'pl' ? 'Język aplikacji' : 'App language'"
  >
    <button
      type="button"
      lang="en"
      :aria-pressed="locale === 'en'"
      :class="{ active: locale === 'en' }"
      @click="changeLanguage('en')"
    >
      EN
    </button>
    <button
      type="button"
      lang="pl"
      :aria-pressed="locale === 'pl'"
      :class="{ active: locale === 'pl' }"
      @click="changeLanguage('pl')"
    >
      PL
    </button>
  </div>
</template>
<style scoped>
.language-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 9px;
  flex-shrink: 0;
}
.language-switch button {
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  min-height: 30px;
  padding: 5px 7px;
  border-radius: 6px;
  cursor: pointer;
}
.language-switch button.active {
  background: var(--teal-soft);
  color: var(--ink);
}
.language-switch button:focus-visible {
  outline: 2px solid var(--teal);
  outline-offset: 2px;
}
</style>
