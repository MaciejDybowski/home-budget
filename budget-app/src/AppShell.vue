<script setup lang="ts">
import { tr, locale } from "./i18n";
import LanguageSwitch from "./i18n/LanguageSwitch.vue";
import { auth, logout } from "./auth";
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  House,
  ArrowDownUp,
  ChartPie,
  Gauge,
  Ellipsis,
  Plus,
  ChevronLeft,
  ChevronRight,
  Upload,
  RefreshCw,
  Moon,
  Sun,
  UserRound,
} from "@lucide/vue";
import EntryEditor from "./household/EntryEditor.vue";
import DateInput from "./household/DateInput.vue";
import { validMonth } from "./household/view-state";
import {
  edit,
  error,
  load,
  loading,
  month,
  state,
  toast,
} from "./household/store";
const DemoNotice =
  import.meta.env.VITE_DEMO_MODE === "true"
    ? defineAsyncComponent(() => import("./household/demo/DemoNotice.vue"))
    : null;
const route = useRoute();
const router = useRouter();
const profileMenuOpen = ref(false);
function closeProfileMenu() {
  profileMenuOpen.value = false;
}
async function signOut() {
  try {
    await logout();
  } catch {
    window.dispatchEvent(new Event("homebudget-logout-failed"));
  }
}
const isNavActive = (path: string) =>
  route.path === path ||
  (path === "/more" &&
    ["/analytics", "/recurring", "/import"].includes(route.path));
const nav = computed(() => [
  { path: "/", label: tr("Start"), icon: House },
  { path: "/transactions", label: tr("Transakcje"), icon: ArrowDownUp },
  { path: "/budget", label: tr("Budżet"), icon: ChartPie },
  { path: "/meters", label: tr("Liczniki"), icon: Gauge },
  { path: "/more", label: tr("Więcej"), icon: Ellipsis },
]);
const dark = ref(
  localStorage.getItem("theme") === "dark" ||
    (!localStorage.getItem("theme") &&
      matchMedia("(prefers-color-scheme: dark)").matches),
);
watch(
  dark,
  (value) => {
    document.documentElement.dataset.theme = value ? "dark" : "light";
    localStorage.setItem("theme", value ? "dark" : "light");
  },
  { immediate: true },
);
const updateReady = ref(false);
const onUpdate = () => {
  updateReady.value = true;
};
const reloadApp = () => window.dispatchEvent(new Event("pwa-apply"));
function shiftMonth(delta: number) {
  const [year, value] = month.value.split("-").map(Number);
  month.value = new Date(Date.UTC(year!, value! - 1 + delta, 1))
    .toISOString()
    .slice(0, 7);
}
const showMonth = computed(
  () =>
    !["/more", "/import", "/analytics"].includes(route.path) &&
    !(route.path === "/transactions" && route.query.from && route.query.to),
);
watch(
  () => route.query.month,
  (value) => {
    if (typeof value === "string" && validMonth(value)) month.value = value;
  },
  { immediate: true },
);
watch(month, () => {
  void load();
  if (route.query.month && route.query.month !== month.value)
    void router.replace({ query: { ...route.query, month: month.value } });
});
watch(locale, () => {
  if (import.meta.env.VITE_DEMO_MODE === "true") void load();
});
watch(
  [() => route.meta.title, locale],
  ([title]) => {
    document.title = `${tr(String(title || "HomeBudget"))} · HomeBudget${import.meta.env.VITE_DEMO_MODE === "true" ? " · Demo" : ""}`;
  },
  { immediate: true },
);
onMounted(() => {
  load();
  window.addEventListener("pwa-update", onUpdate);
});
onUnmounted(() => window.removeEventListener("pwa-update", onUpdate));
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand"
        ><span class="brand-mark"><House :size="23" /></span
        ><span
          >HomeBudget<small>{{ tr("Nasze finanse. Razem.") }}</small></span
        ></RouterLink
      >
      <nav :aria-label="tr('Menu główne')">
        <RouterLink
          v-for="item in nav"
          :key="item.path"
          :to="item.path"
          :class="['nav-item', { active: isNavActive(item.path) }]"
          :aria-current="isNavActive(item.path) ? 'page' : undefined"
          ><component :is="item.icon" :size="21" />{{ item.label }}</RouterLink
        >
      </nav>
      <RouterLink to="/import" class="nav-item import-link"
        ><Upload :size="20" />{{ tr("Import CSV") }}</RouterLink
      >
    </aside>
    <main class="main-content" id="main">
      <header class="topbar">
        <RouterLink to="/" class="mobile-brand"
          >HomeBudget<span>●</span></RouterLink
        ><span class="desktop-only muted small">{{
          tr("Wspólny dom, wspólny plan")
        }}</span>
        <div class="topbar-actions">
          <LanguageSwitch />
          <div
            v-if="auth.enabled"
            class="profile-menu"
            @keydown.esc="closeProfileMenu"
          >
            <button
              class="icon-button profile-avatar"
              :aria-label="tr('Menu profilu')"
              aria-haspopup="menu"
              :aria-expanded="profileMenuOpen"
              @click="profileMenuOpen = !profileMenuOpen"
            >
              <UserRound :size="20" />
            </button>
            <div v-if="profileMenuOpen" class="profile-menu-panel" role="menu">
              <RouterLink
                to="/profile"
                role="menuitem"
                @click="closeProfileMenu"
              >
                {{ tr("Profil") }}
              </RouterLink>
              <button
                class="text-button"
                role="menuitem"
                @click="
                  closeProfileMenu();
                  signOut();
                "
              >
                {{ tr("Wyloguj") }}
              </button>
            </div>
          </div>
          <button
            class="icon-button"
            :aria-label="
              dark ? tr('Włącz jasny wygląd') : tr('Włącz ciemny wygląd')
            "
            @click="dark = !dark"
          >
            <Sun v-if="dark" :size="20" /><Moon v-else :size="20" /></button
          ><button
            class="icon-button"
            :aria-label="tr('Odśwież dane')"
            :disabled="loading"
            @click="load"
          >
            <RefreshCw :size="19" :class="{ spinning: loading }" />
          </button>
        </div>
      </header>
      <DemoNotice v-if="DemoNotice" />
      <div v-if="updateReady" class="notice">
        {{
          tr("Nowa wersja jest gotowa. Zapisz otwarte formularze, a następnie")
        }}
        <button class="text-button" @click="reloadApp">
          {{ tr("odśwież aplikację") }}</button
        >.
      </div>
      <section class="page-heading">
        <div>
          <p class="eyebrow">
            {{
              route.path === "/meters"
                ? tr("Dom pod kontrolą")
                : route.path === "/import"
                  ? tr("Historia bez przepisywania")
                  : tr("Budżet domowy")
            }}
          </p>
          <h1>{{ tr(String(route.meta.title || "HomeBudget")) }}</h1>
        </div>
        <button
          v-if="state && ['/', '/transactions'].includes(route.path)"
          class="button quick-add"
          :aria-label="tr('Dodaj wydatek')"
          @click="edit('expenses')"
        >
          <Plus :size="19" /><span>{{ tr("Dodaj wydatek") }}</span>
        </button>
      </section>
      <div v-if="showMonth" class="month-picker">
        <button
          class="icon-button"
          :aria-label="tr('Poprzedni miesiąc')"
          @click="shiftMonth(-1)"
        >
          <ChevronLeft :size="20" />
        </button>
        <DateInput
          v-model="month"
          mode="month"
          compact
          :label="tr('Wybierz miesiąc')"
          required
        />
        <button
          class="icon-button"
          :aria-label="tr('Następny miesiąc')"
          @click="shiftMonth(1)"
        >
          <ChevronRight :size="20" />
        </button>
      </div>
      <div v-if="error" class="empty-state" role="alert">
        <House :size="36" />
        <h2>{{ tr("Nie możemy pobrać danych") }}</h2>
        <p>{{ tr(error) }}</p>
        <button class="button" @click="load">
          {{ tr("Spróbuj ponownie") }}
        </button>
      </div>
      <div v-else-if="!state" class="loading-state" role="status">
        <span class="loader" />{{ tr("Ładowanie domowego budżetu…") }}
      </div>
      <RouterView v-else />
      <footer class="page-footer">
        {{ tr("HomeBudget · Wasza wspólna perspektywa") }}
      </footer>
    </main>
    <nav class="bottom-nav" :aria-label="tr('Menu główne')">
      <RouterLink
        v-for="item in nav"
        :key="item.path"
        :to="item.path"
        :class="{ active: isNavActive(item.path) }"
        :aria-current="isNavActive(item.path) ? 'page' : undefined"
        ><component
          :is="item.icon"
          :size="22"
          :stroke-width="isNavActive(item.path) ? 2.3 : 1.7"
        /><span>{{ item.label }}</span></RouterLink
      >
    </nav>
    <div v-if="toast" class="toast" role="status">{{ tr(toast) }}</div>
    <EntryEditor />
  </div>
</template>

<style scoped>
.profile-menu {
  position: relative;
}

.profile-menu-panel {
  position: absolute;
  z-index: 30;
  top: calc(100% + 0.5rem);
  right: 0;
  display: grid;
  min-width: 10rem;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  background: var(--surface);
  box-shadow: 0 0.75rem 2rem #0002;
}

.profile-menu-panel a,
.profile-menu-panel button {
  padding: 0.65rem 0.75rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--ink);
  text-align: left;
  text-decoration: none;
}

.profile-menu-panel a:hover,
.profile-menu-panel button:hover {
  background: var(--surface-soft);
}
</style>
