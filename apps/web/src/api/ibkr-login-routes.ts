import {
  emptyIbkrBrowserSnapshot,
  IbkrBrowserSession,
  ibkrResearchRequest,
  ibkrPortalMethods,
  ibkrPortalRequest,
  logoutIbkr,
  pollIbkrApproval,
  restoreIbkrBrowserSession,
  selectIbkrFactor,
  snapshotIbkrBrowserSession,
  startIbkrLogin,
} from "@nora/ibkr/browser-login";
import type {
  IbkrBrowserSnapshot,
  IbkrLoginStatus,
} from "@nora/ibkr/browser-login";
import {
  ibkrCredentialsMessage,
  ibkrGenericLoginMessage,
  IbkrLoginFactorSchema,
  IbkrLoginStartSchema,
} from "@nora/ibkr/browser-schemas";
import type {
  IbkrPortalResponse,
  IbkrResearchNamespace,
} from "@nora/ibkr/browser-schemas";
import {
  ibkrDemoResearchResponse,
  ibkrDemoPortalResponse,
  ibkrDemoUsername,
} from "@nora/ibkr/demo";
import { ibkrLoginError } from "@nora/ibkr/login-error";
import type {
  IbkrLoginError,
  IbkrLoginErrorReason,
} from "@nora/ibkr/login-error";
import { ibkrQuoteStream } from "@nora/ibkr/market-stream";
import type { Schema } from "effect";
import { ByteSize, Clock, Duration, Effect, Layer, Stream } from "effect";
import {
  HttpClient,
  HttpIncomingMessage,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http";

import {
  clearIbkrSessionCookie,
  ibkrCookiePath,
  makeIbkrSessionCookie,
} from "./ibkr-session-cookie";
import type { IbkrCookieWrite } from "./ibkr-session-cookie";

const statusByReason: Record<IbkrLoginErrorReason, number> = {
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  Conflict: 409,
  Rejected: 400,
  Upstream: 502,
};
const internalReasons = new Set<IbkrLoginErrorReason>([
  "BadRequest",
  "Upstream",
]);

/** How long a demo session lasts without activity, like a real one. */
const demoWindowMs = 30 * 60_000;

/** A signed-in demo session: no IBKR cookies, just the authenticated status. */
const demoSnapshot = (now: number): IbkrBrowserSnapshot => ({
  ...emptyIbkrBrowserSnapshot,
  status: {
    state: "authenticated",
    username: ibkrDemoUsername,
    expiresAt: now + demoWindowMs,
    demo: true,
  },
});

/**
 * The quote fields the live stream relays: last, change, change %, prior
 * close and market data availability.
 */
const quoteStreamFields = ["31", "82", "83", "7741", "6509"];

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

type RouteBody =
  | IbkrLoginStatus
  | IbkrPortalResponse
  | { readonly error: string };

interface RouteResult {
  readonly body: RouteBody;
  readonly status?: number;
  readonly cookies?: readonly IbkrCookieWrite[];
}

const readBody = <A>(schema: Schema.ConstraintDecoder<A, never>) =>
  HttpServerRequest.schemaBodyJson(schema).pipe(
    Effect.provideService(
      HttpIncomingMessage.MaxBodySize,
      ByteSize.kilobytes(8)
    ),
    Effect.mapError(() =>
      ibkrLoginError("BadRequest", "IBKR request: invalid input")
    )
  );

/** A passthrough's JSON body, as text for IBKR. */
const readPassthroughBody = (request: HttpServerRequest.HttpServerRequest) =>
  request.text.pipe(
    Effect.provideService(
      HttpIncomingMessage.MaxBodySize,
      ByteSize.kilobytes(64)
    ),
    Effect.mapError(() =>
      ibkrLoginError("BadRequest", "IBKR request: invalid body")
    )
  );

/** The methods each research namespace takes. */
const researchMethods: Record<
  IbkrResearchNamespace,
  readonly ("GET" | "POST")[]
> = {
  fundamentals: ["GET"],
  news2: ["GET"],
  impact: ["GET"],
  hmds: ["GET", "POST"],
};

const researchNamespaces: readonly IbkrResearchNamespace[] = [
  "fundamentals",
  "news2",
  "impact",
  "hmds",
];

/** Runs one login step against a restored session and returns its next snapshot. */
const runInSession = <A, R>(
  snapshot: IbkrBrowserSnapshot,
  effect: Effect.Effect<A, IbkrLoginError, R | IbkrBrowserSession>
) =>
  Effect.gen(function* runInRestoredSession() {
    const session = yield* restoreIbkrBrowserSession(snapshot);
    return yield* Effect.gen(function* runStep() {
      const result = yield* effect;
      const next = yield* snapshotIbkrBrowserSession;
      return { result, next };
    }).pipe(Effect.provideService(IbkrBrowserSession, session));
  });

/**
 * The IBKR browser login API. Session state lives only in encrypted HttpOnly
 * cookies; vendor response bodies and credentials never reach logs or clients.
 */
export const makeIbkrLoginRoutes = (options: {
  readonly origin: string;
  readonly secret: string;
  /** The only IBKR username allowed to sign in, so the API is not an open login relay. */
  readonly allowedUsername: string | undefined;
  /**
   * How long each demo portal call takes, in ms. The fixtures answer
   * instantly; this makes the demo load like the real app, skeletons included.
   */
  readonly demoLatencyMs?: number;
}) =>
  Layer.unwrap(
    Effect.gen(function* buildIbkrLoginRoutes() {
      const cookie = yield* makeIbkrSessionCookie(options.secret);
      // Captured once so handlers need no per-request HttpClient.
      const httpClient = yield* HttpClient.HttpClient;
      const { origin, protocol } = new URL(options.origin);
      const secure = protocol === "https:";
      const allowedUsername =
        options.allowedUsername?.trim().toLowerCase() || undefined;

      const respond = (
        body: RouteBody,
        status: number,
        cookies: readonly IbkrCookieWrite[] = []
      ) => {
        let response = HttpServerResponse.jsonUnsafe(body, {
          status,
          headers: noStoreHeaders,
        });
        for (const write of cookies) {
          response = HttpServerResponse.setCookieUnsafe(
            response,
            write.name,
            write.value,
            {
              path: ibkrCookiePath,
              httpOnly: true,
              sameSite: "strict",
              secure,
              maxAge: Duration.seconds(write.maxAgeSeconds),
            }
          );
        }
        return response;
      };

      /**
       * Runs a route. Login failures with an internal reason reach the client
       * as the generic message; `exposeInternal` keeps them for the portal
       * console, a developer tool.
       */
      const handle = <R>(
        effect: Effect.Effect<RouteResult, IbkrLoginError, R>,
        { exposeInternal = false }: { exposeInternal?: boolean } = {}
      ) =>
        effect.pipe(
          Effect.provideService(HttpClient.HttpClient, httpClient),
          Effect.map(({ body, status, cookies }) =>
            respond(body, status ?? 200, cookies)
          ),
          Effect.catchTag("IbkrLoginError", (failure) => {
            const internal =
              !exposeInternal && internalReasons.has(failure.reason);
            return Effect.as(
              internal
                ? Effect.logWarning("IBKR login failed", failure.message)
                : Effect.void,
              respond(
                { error: internal ? ibkrGenericLoginMessage : failure.message },
                statusByReason[failure.reason]
              )
            );
          })
        );

      const currentSnapshot = Effect.gen(function* currentSnapshot() {
        const request = yield* HttpServerRequest.HttpServerRequest;
        return yield* cookie.read(request.cookies);
      });
      const requireSnapshot = Effect.gen(function* requireSnapshot() {
        const snapshot = yield* currentSnapshot;
        if (!snapshot) {
          return yield* Effect.fail(
            ibkrLoginError(
              "Unauthorized",
              "Your login expired. Please log in again."
            )
          );
        }
        return snapshot;
      });
      const requireSameOrigin = Effect.gen(function* requireSameOrigin() {
        const request = yield* HttpServerRequest.HttpServerRequest;
        if (request.headers.origin !== origin) {
          return yield* Effect.fail(
            ibkrLoginError("Forbidden", ibkrGenericLoginMessage)
          );
        }
      });
      const persisted = Effect.fn("IbkrLogin.persist")(function* persisted<
        A extends RouteBody,
      >(step: { readonly result: A; readonly next: IbkrBrowserSnapshot }) {
        return {
          body: step.result,
          cookies: yield* cookie.write(step.next),
        } satisfies RouteResult;
      });
      /** A POST step on an existing login: same origin, live session, saved afterwards. */
      const sessionStep = <A extends RouteBody, R>(
        effect: Effect.Effect<A, IbkrLoginError, R | IbkrBrowserSession>
      ) =>
        Effect.gen(function* runSessionStep() {
          yield* requireSameOrigin;
          const snapshot = yield* requireSnapshot;
          return yield* persisted(yield* runInSession(snapshot, effect));
        });

      return Layer.mergeAll(
        HttpRouter.add(
          "GET",
          "/api/ibkr/session",
          handle(
            currentSnapshot.pipe(
              Effect.map((snapshot): RouteResult => ({
                body: snapshot?.status ?? { state: "disconnected" },
              }))
            )
          )
        ),
        // Passthrough to IBKR's Client Portal API with the session's cookies,
        // returning IBKR's own status and body.
        HttpRouter.add(
          "*",
          "/api/ibkr/portal/*",
          handle(
            Effect.gen(function* portalRequest() {
              const request = yield* HttpServerRequest.HttpServerRequest;
              const method = ibkrPortalMethods.find(
                (allowed) => allowed === request.method
              );
              if (!method) {
                return yield* Effect.fail(
                  ibkrLoginError(
                    "BadRequest",
                    "IBKR request: unsupported method"
                  )
                );
              }
              if (method !== "GET") {
                yield* requireSameOrigin;
              }
              const snapshot = yield* requireSnapshot;
              const path = request.url.slice("/api/ibkr/portal/".length);
              const body =
                method === "GET" ? "" : yield* readPassthroughBody(request);
              if (snapshot.status.demo) {
                // Answered from fixtures after a network-like wait; activity
                // extends the session.
                yield* Effect.sleep(
                  Duration.millis(options.demoLatencyMs ?? 300)
                );
                const now = yield* Clock.currentTimeMillis;
                const response = ibkrDemoPortalResponse(method, path, body);
                return {
                  ...(yield* persisted({
                    result: response,
                    next: demoSnapshot(now),
                  })),
                  status: response.status,
                };
              }
              const step = yield* runInSession(
                snapshot,
                ibkrPortalRequest(method, path, body)
              );
              return {
                ...(yield* persisted(step)),
                status: step.result.status,
              };
            }),
            { exposeInternal: true }
          )
        ),
        // Live quotes for one contract, relayed from IBKR's WebSocket as
        // server-sent events: the browser can't open IBKR's socket itself,
        // since the session's cookies stay encrypted on this server.
        // `overnight=1` adds the contract's quote on IBKR's overnight venue.
        HttpRouter.add(
          "GET",
          "/api/ibkr/stream/quote",
          Effect.gen(function* quoteStream() {
            const request = yield* HttpServerRequest.HttpServerRequest;
            const query = new URL(request.url, origin).searchParams;
            const conid = query.get("conid") ?? "";
            if (!/^\d{1,12}$/u.test(conid)) {
              return yield* Effect.fail(
                ibkrLoginError("BadRequest", "IBKR request: invalid conid")
              );
            }
            const snapshot = yield* requireSnapshot;
            if (snapshot.status.demo) {
              // Nothing to stream: 204 tells EventSource to stop retrying,
              // and the page keeps polling the demo's snapshot.
              return HttpServerResponse.empty({ headers: noStoreHeaders });
            }
            const session = yield* restoreIbkrBrowserSession(snapshot);
            const updates = yield* ibkrQuoteStream(
              query.get("overnight") === "1"
                ? [conid, `${conid}@OVERNIGHT`]
                : [conid],
              quoteStreamFields
            ).pipe(Effect.provideService(IbkrBrowserSession, session));
            const events = updates.pipe(
              // Quotes as plain messages; connection notes as `status`
              // events, readable in the browser's EventStream panel.
              Stream.map((event) =>
                event._tag === "quote"
                  ? `data: ${JSON.stringify({ conidEx: event.conidEx, fields: event.fields })}\n\n`
                  : `event: status\ndata: ${JSON.stringify(event.text)}\n\n`
              ),
              // A comment now and then, so idle proxies keep it open; it
              // ends with the updates.
              Stream.merge(
                Stream.tick(Duration.seconds(15)).pipe(
                  Stream.map(() => ": ping\n\n")
                ),
                { haltStrategy: "left" }
              )
            );
            return HttpServerResponse.stream(
              Stream.encodeText(
                Stream.concat(Stream.succeed("retry: 3000\n\n"), events)
              ),
              {
                contentType: "text/event-stream",
                headers: { ...noStoreHeaders, "X-Accel-Buffering": "no" },
              }
            );
          }).pipe(
            Effect.catchTag("IbkrLoginError", (failure) =>
              Effect.succeed(
                respond(
                  { error: failure.message },
                  statusByReason[failure.reason]
                )
              )
            )
          )
        ),
        // Research endpoints share authentication but have distinct upstream
        // namespaces. All are read with GETs; the Market Screener (`hmds`)
        // also takes its queries as POSTs.
        ...researchNamespaces.map((namespace) =>
          HttpRouter.add(
            "*",
            `/api/ibkr/${namespace}/*`,
            handle(
              Effect.gen(function* researchRequest() {
                const request = yield* HttpServerRequest.HttpServerRequest;
                const method = researchMethods[namespace].find(
                  (allowed) => allowed === request.method
                );
                if (!method) {
                  return yield* Effect.fail(
                    ibkrLoginError(
                      "BadRequest",
                      "IBKR request: unsupported method"
                    )
                  );
                }
                if (method !== "GET") {
                  yield* requireSameOrigin;
                }
                const snapshot = yield* requireSnapshot;
                const path = request.url.slice(
                  `/api/ibkr/${namespace}/`.length
                );
                if (snapshot.status.demo) {
                  yield* Effect.sleep(
                    Duration.millis(options.demoLatencyMs ?? 300)
                  );
                  const now = yield* Clock.currentTimeMillis;
                  const response = ibkrDemoResearchResponse(
                    namespace,
                    path,
                    method
                  );
                  return {
                    ...(yield* persisted({
                      result: response,
                      next: demoSnapshot(now),
                    })),
                    status: response.status,
                  };
                }
                const body =
                  method === "GET" ? "" : yield* readPassthroughBody(request);
                const step = yield* runInSession(
                  snapshot,
                  ibkrResearchRequest(namespace, path, method, body)
                );
                return {
                  ...(yield* persisted(step)),
                  status: step.result.status,
                };
              }),
              { exposeInternal: true }
            )
          )
        ),
        HttpRouter.add(
          "POST",
          "/api/ibkr/start",
          handle(
            Effect.gen(function* start() {
              yield* requireSameOrigin;
              const body = yield* readBody(IbkrLoginStartSchema);
              // Before the username check, so its answer can't depend on it.
              if (yield* currentSnapshot) {
                return yield* Effect.fail(
                  ibkrLoginError(
                    "Conflict",
                    "Cancel or sign out before starting another login."
                  )
                );
              }
              if (
                !allowedUsername ||
                body.username.trim().toLowerCase() !== allowedUsername
              ) {
                // Answered like a wrong password, so the reply doesn't say
                // which username is allowed. IBKR is never contacted.
                return yield* Effect.fail(
                  ibkrLoginError("Rejected", ibkrCredentialsMessage)
                );
              }
              return yield* persisted(
                yield* runInSession(
                  emptyIbkrBrowserSnapshot,
                  startIbkrLogin(body.username, body.password)
                )
              );
            })
          )
        ),
        // "Try demo": signs in without an account or credentials.
        HttpRouter.add(
          "POST",
          "/api/ibkr/demo",
          handle(
            Effect.gen(function* demo() {
              yield* requireSameOrigin;
              if (yield* currentSnapshot) {
                return yield* Effect.fail(
                  ibkrLoginError(
                    "Conflict",
                    "Cancel or sign out before starting another login."
                  )
                );
              }
              const next = demoSnapshot(yield* Clock.currentTimeMillis);
              return yield* persisted({ result: next.status, next });
            })
          )
        ),
        HttpRouter.add(
          "POST",
          "/api/ibkr/factor",
          handle(
            sessionStep(
              readBody(IbkrLoginFactorSchema).pipe(
                Effect.flatMap((body) => selectIbkrFactor(body.factor))
              )
            )
          )
        ),
        HttpRouter.add(
          "POST",
          "/api/ibkr/poll",
          handle(sessionStep(pollIbkrApproval))
        ),
        HttpRouter.add(
          "POST",
          "/api/ibkr/logout",
          handle(
            Effect.gen(function* logout() {
              yield* requireSameOrigin;
              const snapshot = yield* currentSnapshot;
              if (snapshot && !snapshot.status.demo) {
                // Local cookie removal still completes when IBKR cannot be
                // reached. A demo session has nothing to end at IBKR.
                yield* Effect.ignore(runInSession(snapshot, logoutIbkr));
              }
              return {
                body: { state: "disconnected" },
                cookies: clearIbkrSessionCookie(),
              } satisfies RouteResult;
            })
          )
        )
      );
    })
  );
