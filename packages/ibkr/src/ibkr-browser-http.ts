import { Duration, Effect } from "effect";
import type { Ref } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import type { Cookies, HttpClientError, HttpClientResponse } from "effect/http";

import { ibkrLoginError } from "./ibkr-login-error";
import type { IbkrLoginError } from "./ibkr-login-error";

const allowedHosts = new Set([
  "ndcdyn.interactivebrokers.com",
  "cdcdyn.interactivebrokers.com",
  "www.interactivebrokers.com",
  "portal.interactivebrokers.com",
  // EU visitors are redirected to the Irish entity's login.
  "www.interactivebrokers.ie",
  "api.ibkr.com",
]);

const httpError = (message: string) =>
  ibkrLoginError("Upstream", `IBKR HTTP: ${message}`);

// Names only the host: paths and queries can carry login tokens.
const rejectedDestination = (value: string) =>
  httpError(
    `rejected upstream destination (${URL.parse(value)?.host ?? "invalid URL"})`
  );

/** Session cookies may only ever travel to these IBKR HTTPS hosts. */
export const isAllowedIbkrUrl = (value: string) => {
  const url = URL.parse(value);
  return (
    url?.protocol === "https:" &&
    !url.port &&
    !url.username &&
    !url.password &&
    allowedHosts.has(url.hostname)
  );
};

/**
 * Sends one request inside a login's private cookie jar and returns the
 * response whatever its status. Every hop, redirects included, is checked
 * against the IBKR host list before it is sent.
 */
export const ibkrBrowserSend = Effect.fn("IbkrBrowser.send")(
  function* ibkrBrowserSend(
    cookies: Ref.Ref<readonly Cookies.Cookie[]>,
    request: HttpClientRequest.HttpClientRequest
  ) {
    if (!isAllowedIbkrUrl(request.url)) {
      return yield* Effect.fail(rejectedDestination(request.url));
    }
    const base = yield* HttpClient.HttpClient;
    // The check runs in postprocess: followRedirects sends each hop through the
    // inner client's postprocess only, so a preprocess check would miss redirects.
    const ibkrOnly = HttpClient.makeWith<
      HttpClientError.HttpClientError | IbkrLoginError,
      never,
      HttpClientError.HttpClientError | IbkrLoginError,
      never
    >(
      (hop) =>
        hop.pipe(
          Effect.flatMap(
            (
              current
            ): Effect.Effect<
              HttpClientResponse.HttpClientResponse,
              HttpClientError.HttpClientError | IbkrLoginError
            > =>
              isAllowedIbkrUrl(current.url)
                ? base.postprocess(Effect.succeed(current))
                : Effect.fail(rejectedDestination(current.url))
          )
        ),
      base.preprocess
    );
    const client = ibkrOnly.pipe(
      HttpClient.withCookiesRef(cookies),
      HttpClient.followRedirects(8)
    );
    const response = yield* client.execute(request).pipe(
      Effect.provideService(FetchHttpClient.RequestInit, {
        redirect: "manual",
      }),
      Effect.timeout(Duration.seconds(20)),
      Effect.mapError((error) =>
        error._tag === "IbkrLoginError"
          ? error
          : httpError("upstream request failed")
      )
    );
    if (response.status >= 300 && response.status < 400) {
      return yield* Effect.fail(httpError("too many redirects"));
    }
    return response;
  }
);

/** A login-flow GET, or a form POST when `form` is given; fails unless 2xx. */
export const ibkrBrowserRequest = Effect.fn("IbkrBrowser.request")(
  function* ibkrBrowserRequest(
    cookies: Ref.Ref<readonly Cookies.Cookie[]>,
    url: string,
    form?: URLSearchParams
  ) {
    const origin = URL.parse(url)?.origin ?? "";
    const request =
      form === undefined
        ? HttpClientRequest.get(url)
        : HttpClientRequest.post(url).pipe(
            HttpClientRequest.bodyUrlParams(form),
            HttpClientRequest.setHeaders({
              Origin: origin,
              Referer: `${origin}/sso/Login`,
            })
          );
    const response = yield* ibkrBrowserSend(
      cookies,
      HttpClientRequest.setHeader(
        request,
        "Accept",
        "application/json, text/html;q=0.9"
      )
    );
    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(
        httpError(`upstream returned ${response.status}`)
      );
    }
    return response;
  }
);
