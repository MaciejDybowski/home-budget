import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { ref } from "vue";

interface Status {
  enabled: boolean;
  authenticated: boolean;
  csrfToken?: string;
  expiresAt?: string;
  setupRequired?: boolean;
}
export const auth = ref<Status>({ enabled: true, authenticated: false });
export const authReady = ref(false);
export const authBusy = ref(false);
const client = axios.create({ baseURL: "/api/v1/auth", timeout: 60000 });
let epoch = 0;
let pending = new AbortController();
let expiry: ReturnType<typeof setTimeout>;
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("homebudget-auth")
    : null;

function clearPrivateState() {
  epoch++;
  pending.abort();
  pending = new AbortController();
  window.dispatchEvent(new Event("homebudget-auth-reset"));
}
export function lock() {
  clearTimeout(expiry);
  clearPrivateState();
  auth.value = { ...auth.value, authenticated: false, expiresAt: undefined };
}
function accept(status: Status) {
  if (
    typeof status.enabled !== "boolean" ||
    typeof status.authenticated !== "boolean"
  )
    throw new Error("Invalid authentication response");
  clearTimeout(expiry);
  auth.value = status;
  authReady.value = true;
  if (status.authenticated && status.expiresAt) {
    expiry = setTimeout(
      lock,
      Math.max(0, new Date(status.expiresAt).getTime() - Date.now()),
    );
  }
}
export async function refreshAuth() {
  if (import.meta.env.VITE_DEMO_MODE === "true") {
    accept({ enabled: false, authenticated: false });
    return;
  }
  const previousEpoch = epoch;
  const response = await client.get<Status>("/status", {
    headers: { "Cache-Control": "no-cache" },
  });
  if (previousEpoch !== epoch) return;
  if (auth.value.authenticated && !response.data.authenticated)
    clearPrivateState();
  accept(response.data);
}
export async function login(username: string, password: string, setup = false) {
  if (authBusy.value) return;
  authBusy.value = true;
  try {
    const current = await client.get<Status>("/status");
    auth.value.csrfToken = current.data.csrfToken;
    const response = await client.post<Status>(
      setup ? "/setup" : "/login",
      { username, password },
      {
        headers: { "X-CSRF-Token": auth.value.csrfToken },
      },
    );
    clearPrivateState();
    accept(response.data);
  } finally {
    authBusy.value = false;
  }
}
export async function logout() {
  if (authBusy.value) return;
  authBusy.value = true;
  try {
    // Clear private UI even when the server is unavailable; do not report success
    // unless the server has actually revoked the cookie's session.
    lock();
    channel?.postMessage("logout");
    // Another tab may have rotated the CSRF cookie. Refresh only the token, not
    // the private UI, so retrying logout cannot accidentally reveal the budget.
    const current = await client.get<Status>("/status");
    auth.value.csrfToken = current.data.csrfToken;
    const response = await client.post<Status>(
      "/logout",
      {},
      {
        headers: { "X-CSRF-Token": auth.value.csrfToken },
      },
    );
    accept(response.data);
  } finally {
    authBusy.value = false;
  }
}
channel?.addEventListener("message", (event) => {
  if (event.data === "logout") lock();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && auth.value.enabled && !authBusy.value) {
    lock();
    void refreshAuth().catch(lock);
  }
});
document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    auth.value.enabled &&
    !authBusy.value &&
    auth.value.authenticated
  ) {
    void refreshAuth().catch(lock);
  }
});

export function protectApi(api: AxiosInstance) {
  const epochs = new WeakMap<InternalAxiosRequestConfig, number>();
  api.interceptors.request.use((config) => {
    epochs.set(config, epoch);
    config.signal = config.signal
      ? AbortSignal.any([config.signal as AbortSignal, pending.signal])
      : pending.signal;
    if (
      auth.value.enabled &&
      !["get", "head", "options"].includes(config.method || "get")
    ) {
      config.headers.set("X-CSRF-Token", auth.value.csrfToken);
    }
    return config;
  });
  api.interceptors.response.use(
    (response) => {
      if (epochs.get(response.config) !== epoch)
        throw new axios.CanceledError();
      return response;
    },
    (cause: unknown) => {
      if (
        axios.isAxiosError(cause) &&
        cause.response?.status === 401 &&
        epochs.get(cause.config!) === epoch
      )
        lock();
      return Promise.reject(cause);
    },
  );
}
