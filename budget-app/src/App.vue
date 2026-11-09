<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import axios from "axios";
import { auth, authReady, authBusy, login, logout, refreshAuth } from "./auth";
import { tr, translatedError } from "./i18n";
import LanguageSwitch from "./i18n/LanguageSwitch.vue";
import AppShell from "./AppShell.vue";

const username = ref("");
const password = ref("");
const confirmation = ref("");
const busy = ref(false);
const error = ref("");
const failedLogout = ref(false);
async function check() {
  busy.value = true;
  error.value = "";
  try {
    await refreshAuth();
  } catch {
    error.value = tr(
      "Nie można sprawdzić dostępu. Sprawdź połączenie i spróbuj ponownie.",
    );
  } finally {
    busy.value = false;
  }
}
async function submit() {
  if (auth.value.setupRequired && password.value !== confirmation.value) {
    error.value = tr("Hasła nie są takie same.");
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    await login(username.value, password.value, auth.value.setupRequired);
    failedLogout.value = false;
  } catch (cause) {
    error.value =
      axios.isAxiosError(cause) && cause.response?.data?.message
        ? translatedError(cause.response.data.message)
        : tr("Nie można się zalogować. Sprawdź połączenie i spróbuj ponownie.");
  } finally {
    password.value = "";
    confirmation.value = "";
    busy.value = false;
  }
}
function logoutFailed() {
  failedLogout.value = true;
  error.value = tr(
    "Nie potwierdzono wylogowania na serwerze. Sprawdź połączenie i spróbuj ponownie.",
  );
}
async function retryLogout() {
  busy.value = true;
  try {
    await logout();
    failedLogout.value = false;
    error.value = "";
  } catch {
    logoutFailed();
  } finally {
    busy.value = false;
  }
}
onMounted(() => {
  void check();
  window.addEventListener("homebudget-logout-failed", logoutFailed);
});
onUnmounted(() =>
  window.removeEventListener("homebudget-logout-failed", logoutFailed),
);
</script>

<template>
  <AppShell v-if="authReady && (!auth.enabled || auth.authenticated)" />
  <main v-else class="auth-page">
    <section class="auth-card">
      <div class="auth-language"><LanguageSwitch /></div>
      <p class="eyebrow">HomeBudget</p>
      <h1>
        {{
          auth.setupRequired
            ? tr("Ustaw login i hasło")
            : tr("Wasz domowy budżet")
        }}
      </h1>
      <p class="muted">
        {{
          auth.setupRequired
            ? tr(
                "To pierwsze uruchomienie. Ustaw wspólny dostęp do tej instalacji.",
              )
            : tr("Zaloguj się, aby otworzyć wspólny budżet.")
        }}
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <button
        v-if="failedLogout"
        class="button"
        :disabled="busy || authBusy"
        @click="retryLogout"
      >
        {{ tr("Ponów wylogowanie") }}
      </button>
      <form v-if="authReady" @submit.prevent="submit">
        <label for="auth-username">{{ tr("Login") }}</label>
        <input
          id="auth-username"
          v-model="username"
          name="username"
          autocomplete="username"
          maxlength="64"
          required
          :disabled="busy || authBusy"
        />
        <label for="auth-password">{{ tr("Hasło") }}</label>
        <input
          id="auth-password"
          v-model="password"
          name="password"
          type="password"
          :autocomplete="
            auth.setupRequired ? 'new-password' : 'current-password'
          "
          :minlength="auth.setupRequired ? 12 : undefined"
          maxlength="1024"
          required
          :disabled="busy || authBusy"
        />
        <template v-if="auth.setupRequired">
          <label for="auth-confirmation">{{ tr("Powtórz hasło") }}</label>
          <input
            id="auth-confirmation"
            v-model="confirmation"
            type="password"
            autocomplete="new-password"
            required
            maxlength="1024"
            :disabled="busy || authBusy"
          />
          <p class="muted">{{ tr("Hasło: co najmniej 12 znaków.") }}</p>
        </template>
        <button class="button" type="submit" :disabled="busy || authBusy">
          {{
            busy
              ? tr("Logowanie…")
              : auth.setupRequired
                ? tr("Utwórz dostęp")
                : tr("Zaloguj")
          }}
        </button>
      </form>
      <p v-else-if="busy" role="status">{{ tr("Sprawdzanie dostępu…") }}</p>
      <button v-else class="button" @click="check">
        {{ tr("Spróbuj ponownie") }}
      </button>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
}
.auth-card {
  width: min(100%, 440px);
  background: var(--surface, white);
  padding: 32px;
  border-radius: 24px;
  box-shadow: 0 8px 40px #102b3310;
}
.auth-language {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 24px;
}
h1 {
  margin: 12px 0;
}
form {
  display: grid;
  gap: 12px;
  margin-top: 24px;
}
input {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid #9fadb5;
  border-radius: 10px;
  font: inherit;
  background: var(--surface, white);
  color: inherit;
}
form button {
  margin-top: 12px;
}
[role="alert"] {
  color: #a12626;
  margin-top: 20px;
}
</style>
