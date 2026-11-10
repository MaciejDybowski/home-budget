<script setup lang="ts">
import { onMounted, ref } from "vue";
import { auth, authApi, refreshAuth } from "../auth";
import { tr } from "../i18n";
import { message } from "./store";

const username = ref("");
const currentPassword = ref("");
const newPassword = ref("");
const confirmation = ref("");
const busy = ref(false);
const loading = ref(true);
const error = ref("");
const success = ref("");

onMounted(async () => {
  if (!auth.value.enabled) {
    loading.value = false;
    return;
  }
  try {
    const response = await authApi.get<{ username: string }>("/profile");
    username.value = response.data.username;
  } catch (cause) {
    error.value = message(cause);
  } finally {
    loading.value = false;
  }
});

async function save() {
  if (busy.value) return;
  error.value = "";
  success.value = "";
  if (
    (newPassword.value || confirmation.value) &&
    newPassword.value !== confirmation.value
  ) {
    error.value = tr("Hasła nie są takie same.");
    return;
  }
  busy.value = true;
  try {
    await authApi.patch(
      "/profile",
      {
        username: username.value,
        currentPassword: currentPassword.value,
        ...(newPassword.value ? { newPassword: newPassword.value } : {}),
      },
      { headers: { "X-CSRF-Token": auth.value.csrfToken } },
    );
    await refreshAuth();
    currentPassword.value = "";
    newPassword.value = "";
    confirmation.value = "";
    success.value = tr("Zapisano profil i odświeżono sesję.");
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="card profile-card" aria-labelledby="profile-title">
    <h2 id="profile-title">{{ tr("Dane logowania") }}</h2>
    <p class="muted">
      {{ tr("Zmiana loginu lub hasła wyloguje pozostałe urządzenia.") }}
    </p>
    <p v-if="loading" role="status">{{ tr("Ładowanie profilu…") }}</p>
    <p v-if="!auth.enabled" class="muted">
      {{ tr("Logowanie jest wyłączone dla tej instalacji.") }}
    </p>
    <form v-else-if="!loading" class="profile-form" @submit.prevent="save">
      <label for="profile-username">{{ tr("Login") }}</label>
      <input
        id="profile-username"
        v-model="username"
        autocomplete="username"
        maxlength="64"
        pattern="[A-Za-z0-9._-]{1,64}"
        required
        :disabled="busy"
      />

      <h3>{{ tr("Zmiana hasła") }}</h3>
      <p class="muted">
        {{ tr("Pozostaw nowe hasło puste, jeśli chcesz zmienić tylko login.") }}
      </p>
      <label for="profile-current-password">{{ tr("Aktualne hasło") }}</label>
      <input
        id="profile-current-password"
        v-model="currentPassword"
        type="password"
        autocomplete="current-password"
        maxlength="1024"
        required
        :disabled="busy"
      />
      <label for="profile-new-password">{{ tr("Nowe hasło") }}</label>
      <input
        id="profile-new-password"
        v-model="newPassword"
        type="password"
        autocomplete="new-password"
        minlength="12"
        maxlength="1024"
        :disabled="busy"
      />
      <label for="profile-confirm-password">{{
        tr("Powtórz nowe hasło")
      }}</label>
      <input
        id="profile-confirm-password"
        v-model="confirmation"
        type="password"
        autocomplete="new-password"
        minlength="12"
        maxlength="1024"
        :disabled="busy"
      />
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="success" role="status">{{ success }}</p>
      <button class="button" type="submit" :disabled="busy || !currentPassword">
        {{ busy ? tr("Zapisywanie…") : tr("Zapisz zmiany") }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.profile-card {
  max-width: 38rem;
}

.profile-form {
  display: grid;
  gap: 0.7rem;
  margin-top: 1.25rem;
}

.profile-form h3 {
  margin: 1rem 0 0;
}

.profile-form input {
  width: 100%;
}
</style>
