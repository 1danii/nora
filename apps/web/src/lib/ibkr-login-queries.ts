import {
  IbkrApiErrorSchema,
  ibkrGenericLoginMessage,
  IbkrLoginModeResponseSchema,
  IbkrLoginStatusSchema,
  IbkrPortalResponseSchema,
} from "@nora/ibkr/browser-schemas";
import { queryOptions } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { appendResponseHeader, getRequest } from "@tanstack/react-start/server";
import { Schema } from "effect";

import { handleApiRequest } from "@/api/api-handler.server";

/**
 * In the browser, a same-origin fetch. During SSR, loaders call the API
 * handler in-process with the page request's cookies, and cookies it sets
 * are passed on to the page response.
 */
const fetchApi = createIsomorphicFn()
  .server(async (path: string, init: RequestInit) => {
    const page = getRequest();
    const headers = new Headers(init.headers);
    const cookie = page.headers.get("cookie");
    if (cookie) {
      headers.set("cookie", cookie);
    }
    // The app calling itself, so POSTs pass the same-origin check. A
    // cross-site page load can't abuse it: the SameSite=Strict session
    // cookie isn't sent with it.
    headers.set("origin", process.env.APP_ORIGIN ?? new URL(page.url).origin);
    const response = await handleApiRequest(
      new Request(new URL(path, page.url), {
        method: init.method,
        headers,
        body: init.body,
      })
    );
    for (const value of response.headers.getSetCookie()) {
      appendResponseHeader("set-cookie", value);
    }
    return response;
  })
  .client((path: string, init: RequestInit) => fetch(path, init));

const decodeApiError = Schema.decodeUnknownOption(IbkrApiErrorSchema);

/** Calls Nora's same-origin IBKR API and validates its response at the network boundary. */
export const requestIbkrLogin = async <A>(
  path: string,
  schema: Schema.ConstraintDecoder<A, never>,
  body?: Record<string, string>
): Promise<A> => {
  const options: RequestInit = {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
  };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  // Network failures and unreadable responses get the generic message; the
  // API's own error messages are already written for people.
  const generic = new Error(ibkrGenericLoginMessage);
  const response = await fetchApi(`/api/ibkr/${path}`, options).catch(() => {
    throw generic;
  });
  const result: unknown = await response.json().catch(() => {
    throw generic;
  });
  if (!response.ok) {
    const error = decodeApiError(result);
    throw error._tag === "Some" ? new Error(error.value.error) : generic;
  }
  const decoded = Schema.decodeUnknownOption(schema)(result);
  if (decoded._tag === "None") {
    throw generic;
  }
  return decoded.value;
};

/** Current login progress; authentication actions are never retried automatically. */
export const ibkrSessionQuery = queryOptions({
  queryKey: ["ibkr", "session"],
  queryFn: () => requestIbkrLogin("session", IbkrLoginStatusSchema),
  retry: false,
  // Login steps update this entry directly, so the server-rendered value
  // doesn't need an immediate refetch after hydration.
  staleTime: 30_000,
});

/**
 * Whether this deployment takes real IBKR logins or only the demo. Fixed for
 * the life of the deployment, so it's asked once.
 */
export const ibkrLoginModeQuery = queryOptions({
  queryKey: ["ibkr", "login-mode"],
  queryFn: async () => {
    const { mode } = await requestIbkrLogin(
      "login-mode",
      IbkrLoginModeResponseSchema
    );
    return mode;
  },
  staleTime: "static",
});

const decodePortalResponse = Schema.decodeUnknownOption(
  IbkrPortalResponseSchema
);

/** Calls one of Nora's IBKR passthroughs; IBKR error statuses throw. */
const requestIbkrPassthrough = async (
  passthrough: "portal" | "fundamentals" | "news2" | "impact" | "hmds",
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  jsonBody = ""
) => {
  const options: RequestInit = {
    method,
    credentials: "same-origin",
    cache: "no-store",
  };
  if (jsonBody) {
    options.headers = { "Content-Type": "application/json" };
    options.body = jsonBody;
  }
  const response = await fetchApi(`/api/ibkr/${passthrough}/${path}`, options);
  const result: unknown = await response.json();
  const portal = decodePortalResponse(result);
  if (portal._tag === "None") {
    const error = decodeApiError(result);
    throw new Error(
      error._tag === "Some" ? error.value.error : "IBKR request failed."
    );
  }
  if (portal.value.status >= 400) {
    throw new Error(
      `IBKR ${portal.value.status}: ${JSON.stringify(portal.value.body)}`
    );
  }
  return portal.value.body;
};

/**
 * Calls IBKR's Client Portal API through Nora's passthrough. `path` is
 * relative to `/portal.proxy/v1/portal/`; IBKR error statuses throw.
 */
export const requestIbkrPortal = (
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  jsonBody = ""
) => requestIbkrPassthrough("portal", method, path, jsonBody);

/**
 * A GET from IBKR's fundamentals app (company profile, analyst
 * ratings). `path` is relative to `/tws.proxy/fundamentals/`.
 */
export const requestIbkrFundamentals = (path: string) =>
  requestIbkrPassthrough("fundamentals", "GET", path);

/** Reads company news relative to the separate `/tws.proxy/news2/` API. */
export const requestIbkrNews = (path: string) =>
  requestIbkrPassthrough("news2", "GET", path);

/**
 * Reads IBKR's popular lists, relative to `/tws.proxy/impact/`: the lists
 * GlobalTrader's Explore shows, e.g. "Popular with IBKR clients".
 */
export const requestIbkrImpact = (path: string) =>
  requestIbkrPassthrough("impact", "GET", path);

/**
 * Calls the Client Portal's Market Screener, relative to
 * `/tws.proxy/hmds/`: its metadata are GETs, its queries POSTs. Its queries
 * need the brokerage session open.
 */
export const requestIbkrScreener = (
  method: "GET" | "POST",
  path: string,
  jsonBody = ""
) => requestIbkrPassthrough("hmds", method, path, jsonBody);

/** A Client Portal GET, relative to `/portal.proxy/v1/portal/`. */
export const ibkrPortalQuery = (path: string) =>
  queryOptions({
    queryKey: ["ibkr", "portal", path],
    queryFn: () => requestIbkrPortal("GET", path),
    retry: false,
    staleTime: 30_000,
  });

/** Keeps the IBKR session alive while the app is open, like IBKR's web app. */
export const ibkrTickleQuery = queryOptions({
  queryKey: ["ibkr", "tickle"],
  queryFn: () => requestIbkrPortal("POST", "tickle"),
  retry: false,
  refetchInterval: 60_000,
  refetchIntervalInBackground: true,
});
