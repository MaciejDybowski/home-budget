import { AxiosError, AxiosHeaders, type AxiosAdapter } from "axios";
import { demoRequest } from "./model";
import { translateRecord } from "../../i18n/core";

export const demoAdapter: AxiosAdapter = async (config) => {
  const url = new URL(config.url || "", "https://demo.invalid/");
  const params = Object.fromEntries(url.searchParams);
  Object.assign(params, config.params || {});
  const input =
    typeof config.data === "string"
      ? JSON.parse(config.data)
      : config.data || {};
  try {
    const data = demoRequest(
      (config.method || "get").toLowerCase(),
      url.pathname.replace(/^\//, ""),
      input,
      params,
    );
    return {
      data: translateRecord(JSON.parse(JSON.stringify(data))),
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config,
    };
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : "Nie udało się wykonać operacji w demo.";
    throw new AxiosError(message, "ERR_BAD_REQUEST", config, undefined, {
      data: { message },
      status: 400,
      statusText: "Bad Request",
      headers: new AxiosHeaders(),
      config,
    });
  }
};
