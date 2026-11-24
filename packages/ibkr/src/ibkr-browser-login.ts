import {
  Clock,
  Context,
  Effect,
  Option,
  Ref,
  Result,
  Schema,
  SchemaTransformation,
} from "effect";
import { Cookies, HttpClientRequest } from "effect/http";

import { bytesToHex } from "./bigint-bytes";
import { ibkrBrowserRequest, ibkrBrowserSend } from "./ibkr-browser-http";
import {
  ibkrCredentialsMessage,
  IbkrLoginStatusSchema,
} from "./ibkr-browser-schemas";
import type { IbkrResearchNamespace } from "./ibkr-browser-schemas";
import { createIbkrSrp, ibkrSrpDefaults } from "./ibkr-browser-srp";
import { ibkrLoginError } from "./ibkr-login-error";

export { IbkrLoginError } from "./ibkr-login-error";
export type { IbkrLoginErrorReason } from "./ibkr-login-error";
export type { IbkrLoginStatus } from "./ibkr-browser-schemas";

/** Only IB Key push approval is supported; there is no code entry. */
const factorLabels = new Map([
  ["5.2a", "IB Key (Android)"],
  ["5.2i", "IB Key (iOS)"],
]);
const secondFactorWindowMs = 120_000;
const authenticatedWindowMs = 30 * 60_000;

/** IBKR's login script compares these flags to the string "true"; booleans are accepted too. */
const IbkrFlagSchema = Schema.Union([Schema.Boolean, Schema.String]).pipe(
  Schema.decodeTo(
    Schema.Boolean,
    SchemaTransformation.transform({
      decode: (value) => value === true || value === "true",
      encode: (value) => value,
    })
  )
);

/** Vendor replies, parsed at the upstream boundary. Unknown fields are ignored. */
const AuthResponseSchema = Schema.Struct({
  N: Schema.optional(Schema.String),
  g: Schema.optional(Schema.String),
  hash: Schema.optional(Schema.String),
  proto: Schema.optional(Schema.String),
  B: Schema.optional(Schema.String),
  s: Schema.optional(Schema.String),
  rsapub: Schema.optional(Schema.String),
  M2: Schema.optional(Schema.String),
  lp: Schema.optional(Schema.Boolean),
  ERROR: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Unknown),
  reached_max_login: Schema.optional(IbkrFlagSchema),
  sftypes: Schema.optional(
    Schema.Array(Schema.Union([Schema.String, Schema.Number]))
  ),
  sf_disabled: Schema.optional(
    Schema.Array(Schema.Union([Schema.String, Schema.Number]))
  ),
  push_sent: Schema.optional(IbkrFlagSchema),
  auth_res: Schema.optional(IbkrFlagSchema),
});
type AuthResponse = typeof AuthResponseSchema.Type;

const StoredCookieSchema = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
  domain: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  expires: Schema.optional(Schema.Number),
  secure: Schema.optional(Schema.Boolean),
  httpOnly: Schema.optional(Schema.Boolean),
  hostOnly: Schema.optional(Schema.Boolean),
});

/** Server-only login state. It is encrypted before it reaches a browser cookie. */
export const IbkrBrowserSnapshotSchema = Schema.Struct({
  cookies: Schema.Array(StoredCookieSchema),
  authenticator: Schema.String,
  dispatcher: Schema.String,
  service: Schema.String,
  sessionKey: Schema.String,
  factor: Schema.String,
  counter: Schema.Number,
  forwardFields: Schema.String,
  status: IbkrLoginStatusSchema,
});
export type IbkrBrowserSnapshot = typeof IbkrBrowserSnapshotSchema.Type;
type SessionState = Omit<IbkrBrowserSnapshot, "cookies">;

const emptySessionState: SessionState = {
  authenticator: "https://ndcdyn.interactivebrokers.com/sso/Authenticator",
  dispatcher: "https://ndcdyn.interactivebrokers.com/sso/Dispatcher",
  service: "AM.LOGIN",
  sessionKey: "",
  factor: "",
  counter: 0,
  forwardFields: "loginType=1",
  status: { state: "disconnected" },
};
export const emptyIbkrBrowserSnapshot: IbkrBrowserSnapshot = {
  ...emptySessionState,
  cookies: [],
};

/** One login attempt's cookie jar and progress, restored from and saved to a snapshot. */
export class IbkrBrowserSession extends Context.Service<
  IbkrBrowserSession,
  {
    readonly cookies: Ref.Ref<readonly Cookies.Cookie[]>;
    readonly state: Ref.Ref<SessionState>;
  }
>()("@nora/ibkr/IbkrBrowserSession") {}

export const restoreIbkrBrowserSession = Effect.fn("IbkrLogin.restore")(
  function* restoreIbkrBrowserSession(snapshot: IbkrBrowserSnapshot) {
    const { cookies, ...state } = snapshot;
    const restored = cookies.flatMap(({ name, value, expires, ...options }) => {
      const cookie = Cookies.makeCookie(name, value, {
        ...options,
        expires: expires === undefined ? undefined : new Date(expires),
      });
      return Result.isSuccess(cookie) ? [cookie.success] : [];
    });
    return IbkrBrowserSession.of({
      cookies: yield* Ref.make<readonly Cookies.Cookie[]>(restored),
      state: yield* Ref.make<SessionState>(state),
    });
  }
);

export const snapshotIbkrBrowserSession = Effect.gen(
  function* snapshotIbkrBrowserSession() {
    const session = yield* IbkrBrowserSession;
    const cookies = yield* Ref.get(session.cookies);
    const state = yield* Ref.get(session.state);
    return {
      ...state,
      cookies: cookies.map(({ name, value, options }) => ({
        name,
        value,
        domain: options?.domain,
        path: options?.path,
        expires: options?.expires?.getTime(),
        secure: options?.secure,
        httpOnly: options?.httpOnly,
        hostOnly: options?.hostOnly,
      })),
    } satisfies IbkrBrowserSnapshot;
  }
);

const decodeNonEmpty = Schema.decodeUnknownOption(Schema.NonEmptyString);

const requiredField = (response: AuthResponse, name: keyof AuthResponse) =>
  decodeNonEmpty(response[name]).pipe(
    Effect.fromOption,
    Effect.mapError(() =>
      ibkrLoginError("Upstream", `IBKR login: missing ${name}`)
    )
  );

const updateState = (update: (state: SessionState) => SessionState) =>
  Effect.gen(function* updateSessionState() {
    const session = yield* IbkrBrowserSession;
    yield* Ref.update(session.state, update);
  });

const currentState = Effect.gen(function* readSessionState() {
  const session = yield* IbkrBrowserSession;
  return yield* Ref.get(session.state);
});

/** Current login progress, safe to return to the browser. */
export const ibkrLoginStatus = currentState.pipe(
  Effect.map((state) => state.status)
);

/** The session's state, failing unless the login has finished. */
export const authenticatedIbkrState = Effect.gen(
  function* authenticatedIbkrState() {
    const state = yield* currentState;
    if (state.status.state !== "authenticated") {
      return yield* Effect.fail(
        ibkrLoginError("Unauthorized", "IBKR login: not authenticated")
      );
    }
    return state;
  }
);

const currentUsername = Effect.gen(function* currentUsername() {
  const { status } = yield* currentState;
  if (!status.username) {
    return yield* Effect.fail(
      ibkrLoginError("BadRequest", "IBKR login: missing username")
    );
  }
  return status.username;
});

const authAction = Effect.fn("IbkrLogin.action")(function* authAction(
  fields: Readonly<Record<string, string>>
) {
  const session = yield* IbkrBrowserSession;
  const { authenticator } = yield* Ref.get(session.state);
  const response = yield* ibkrBrowserRequest(
    session.cookies,
    authenticator,
    new URLSearchParams({ RESP_TYPE: "JSON", ...fields })
  );
  const unexpected = ibkrLoginError(
    "Upstream",
    "IBKR login: unexpected response"
  );
  const body = yield* response.json.pipe(Effect.mapError(() => unexpected));
  const parsed = yield* Schema.decodeUnknownEffect(AuthResponseSchema)(
    body
  ).pipe(Effect.mapError(() => unexpected));
  if (parsed.ERROR || parsed.error || parsed.reached_max_login) {
    return yield* Effect.fail(
      ibkrLoginError(
        "Rejected",
        "IBKR rejected the login. Check your details or try again later."
      )
    );
  }
  return parsed;
});

/** Lowercase hex of SHA-256, for IDs stable per user. */
const sha256Hex = (text: string) =>
  Effect.promise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  ).pipe(Effect.map((digest) => bytesToHex(new Uint8Array(digest))));

/**
 * Sets cookies as IBKR's login scripts do: for the auth host's parent domain
 * (the host minus its first label), so every IBKR host under it receives them.
 */
const setScriptCookies = Effect.fn("IbkrLogin.setScriptCookies")(
  function* setScriptCookies(
    authUrl: string,
    cookies: readonly (readonly [name: string, value: string])[]
  ) {
    const session = yield* IbkrBrowserSession;
    const { hostname } = new URL(authUrl);
    const domain = hostname.slice(hostname.indexOf("."));
    const now = yield* Clock.currentTimeMillis;
    yield* Ref.update(
      session.cookies,
      Cookies.mergeIntoArray(
        authUrl,
        Cookies.fromSetCookie(
          cookies.map(
            ([name, value]) =>
              `${name}=${value}; Domain=${domain}; Path=/; Secure; SameSite=None`
          )
        ),
        now
      )
    );
  }
);

/**
 * The cookies IBKR's login script sets before it authenticates: `SBID`,
 * `TABID`, and `device.info`, a device ID and MAC-like address the script
 * makes up once per browser. IBKR records the device as the session's
 * `HARDWARE_INFO`, and the Market Screener (`/tws.proxy/hmds/`) refuses a
 * session without one ("Missing required information"). Derived from the
 * username, so IBKR sees one device per user, as with a browser.
 */
const setDeviceCookies = Effect.fn("IbkrLogin.setDeviceCookies")(
  function* setDeviceCookies(authServer: string) {
    const { status } = yield* currentState;
    const now = yield* Clock.currentTimeMillis;
    const hex = yield* sha256Hex(`bread-device:${status.username ?? ""}`);
    const id = hex.slice(0, 8);
    const mac = ["16", ...(hex.slice(8, 18).match(/../gu) ?? [])]
      .join(":")
      .toUpperCase();
    yield* setScriptCookies(`https://${authServer}/`, [
      ["SBID", `${hex.slice(18, 30)}${now.toString(36)}`],
      ["TABID", `AM-${hex.slice(30, 42)}-${now}`],
      ["device.info", btoa(JSON.stringify({ id, mac }))],
    ]);
  }
);

/** Reads the login page's service name, auth host and forwarding fields. */
const bootstrap = Effect.gen(function* bootstrap() {
  const session = yield* IbkrBrowserSession;
  const page = yield* ibkrBrowserRequest(
    session.cookies,
    "https://ndcdyn.interactivebrokers.com/sso/Login"
  );
  const html = yield* page.text.pipe(
    Effect.mapError(() =>
      ibkrLoginError("Upstream", "IBKR login: login page unavailable")
    )
  );
  const configValue = (key: string) =>
    new RegExp(`\\b${key}:\\s*['"]([^'"]*)['"]`, "u").exec(html)?.[1];
  // Without AUTH_SERVER, IBKR's login script posts to the page's own host,
  // which is a regional one (e.g. www.interactivebrokers.ie) after a geo redirect.
  const authServer = configValue("AUTH_SERVER") ?? new URL(page.url).host;
  const forwardFields = new URLSearchParams({ loginType: "1" });
  for (const [config, field] of [
    ["POST_FORWARD_PARAMETER", "forwardParameter"],
    ["POST_CONTINUE", "continue"],
    ["POST_FORWARD_TO", "forwardTo"],
  ] as const) {
    const value = configValue(config);
    if (value) {
      forwardFields.set(field, value);
    }
  }
  yield* updateState((state) => ({
    ...state,
    service: configValue("SERVICE") ?? "AM.LOGIN",
    forwardFields: forwardFields.toString(),
    authenticator: `https://${authServer}/sso/Authenticator`,
    dispatcher: `https://${authServer}/sso/Dispatcher`,
  }));
  yield* setDeviceCookies(authServer);
});

export const ibkrPortalMethods = ["GET", "POST", "PUT", "DELETE"] as const;
export type IbkrPortalMethod = (typeof ibkrPortalMethods)[number];

const decodeJsonText = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Json)
);

/**
 * One authenticated call on the host that served the login (e.g.
 * www.interactivebrokers.ie), under `prefix` and with the headers IBKR's web
 * app sends. IBKR's status and body are returned unchanged.
 */
const sessionRequest = Effect.fn("IbkrLogin.sessionRequest")(
  function* sessionRequest(options: {
    readonly prefix: string;
    readonly path: string;
    readonly method: IbkrPortalMethod;
    readonly jsonBody?: string;
    readonly headers?: Readonly<Record<string, string | undefined>>;
  }) {
    const session = yield* IbkrBrowserSession;
    const { dispatcher } = yield* authenticatedIbkrState;
    const base = new URL(options.prefix, dispatcher);
    const url = new URL(options.path, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      return yield* Effect.fail(
        ibkrLoginError("BadRequest", "IBKR request: invalid path")
      );
    }
    const request = HttpClientRequest.make(options.method)(url.href).pipe(
      HttpClientRequest.setHeaders({
        Accept: "application/json",
        Origin: base.origin,
        Referer: `${base.origin}/portal/`,
        ...options.headers,
      })
    );
    const response = yield* ibkrBrowserSend(
      session.cookies,
      options.jsonBody
        ? HttpClientRequest.bodyText(
            request,
            options.jsonBody,
            "application/json"
          )
        : request
    );
    const text = yield* response.text.pipe(
      Effect.mapError(() =>
        ibkrLoginError("Upstream", "IBKR request: unreadable response")
      )
    );
    return {
      status: response.status,
      body: Option.getOrElse(decodeJsonText(text), () => text),
    };
  }
);

/**
 * One Client Portal API call, as IBKR's web app makes it. `path` is relative
 * to `/portal.proxy/v1/portal/`. A successful call extends the session like
 * the web app's activity does.
 */
export const ibkrPortalRequest = Effect.fn("IbkrLogin.portalRequest")(
  function* ibkrPortalRequest(
    method: IbkrPortalMethod,
    path: string,
    jsonBody?: string
  ) {
    const response = yield* sessionRequest({
      prefix: "/portal.proxy/v1/portal/",
      path,
      method,
      jsonBody,
    });
    if (response.status < 400) {
      const now = yield* Clock.currentTimeMillis;
      yield* updateState((current) => ({
        ...current,
        status: { ...current.status, expiresAt: now + authenticatedWindowMs },
      }));
    }
    return response;
  }
);

const decodeSsoUser = Schema.decodeUnknownOption(
  Schema.Struct({ USER_ID: Schema.Number })
);

/**
 * The `USERID` cookie, as IBKR's web app sets it from `sso/validate`:
 * without it, `/tws.proxy/hmds/` refuses every call ("Invalid headers").
 * Read once, then kept with the session's cookies.
 */
const ensureUserIdCookie = Effect.gen(function* ensureUserIdCookie() {
  const session = yield* IbkrBrowserSession;
  const cookies = yield* Ref.get(session.cookies);
  if (cookies.some((cookie) => cookie.name === "USERID")) {
    return;
  }
  const validated = yield* ibkrPortalRequest("GET", "sso/validate");
  const user = decodeSsoUser(validated.body);
  if (Option.isNone(user)) {
    return;
  }
  const { authenticator } = yield* currentState;
  yield* setScriptCookies(authenticator, [
    ["USERID", String(user.value.USER_ID)],
  ]);
});

const decodeBrokerageSession = Schema.decodeUnknownOption(
  Schema.Struct({ sessionId: Schema.String })
);

/**
 * What `/tws.proxy/hmds/` needs besides the login's cookies: the `USERID`
 * cookie, and the brokerage session's ID (`sessionId` from
 * `iserver/accounts`), which IBKR's web app sends as `x-ccp-session-id`.
 * The Market Screener's queries fail without it ("Missing required
 * information"). Undefined when the brokerage session isn't open.
 */
const hmdsSessionId = Effect.gen(function* hmdsSessionId() {
  yield* ensureUserIdCookie;
  const accounts = yield* ibkrPortalRequest("GET", "iserver/accounts");
  return Option.getOrUndefined(decodeBrokerageSession(accounts.body))
    ?.sessionId;
});

/**
 * One per server instance, as IBKR's web app keeps one per page load. Made on
 * first use: Workers allow no random values while a module loads.
 */
let researchSessionId: string | undefined;
let researchRequestId = 0;

/**
 * Calls an allowlisted research namespace under `/tws.proxy/` using the
 * login's session headers: a GET, or a POST with a JSON body (the Market
 * Screener's queries are POSTs).
 */
export const ibkrResearchRequest = Effect.fn("IbkrLogin.researchRequest")(
  function* ibkrResearchRequest(
    namespace: IbkrResearchNamespace,
    path: string,
    method: "GET" | "POST" = "GET",
    jsonBody?: string
  ) {
    const session = yield* IbkrBrowserSession;
    const { service } = yield* authenticatedIbkrState;
    const ccpSessionId =
      namespace === "hmds" ? yield* hmdsSessionId : undefined;
    const cookies = yield* Ref.get(session.cookies);
    const sessionKey = cookies.find((cookie) => cookie.name === "XYZAB")?.value;
    researchSessionId ??= crypto.randomUUID();
    researchRequestId += 1;
    return yield* sessionRequest({
      prefix: `/tws.proxy/${namespace}/`,
      path,
      method,
      jsonBody,
      // Effect drops headers whose value is undefined.
      headers: {
        "x-session-id": researchSessionId,
        "x-request-id": String(researchRequestId),
        "X-SERVICE": service,
        "x-embedded-in": "web",
        "x-client-label": "IB",
        "x-ccp-session-id": ccpSessionId,
        "X-XYZAB": sessionKey,
      },
    });
  }
);

/** Adds the client-derived session cookies, then completes the portal handoff. */
const finish = Effect.gen(function* finish() {
  const session = yield* IbkrBrowserSession;
  const state = yield* Ref.get(session.state);
  const now = yield* Clock.currentTimeMillis;
  yield* setScriptCookies(state.authenticator, [
    ["XYZAB", state.sessionKey],
    [`XYZAB_${state.service}`, state.sessionKey],
  ]);
  const handoff = yield* ibkrBrowserRequest(
    session.cookies,
    state.dispatcher,
    new URLSearchParams(state.forwardFields)
  );
  if (new URL(handoff.url).pathname === "/sso/Login") {
    return yield* Effect.fail(
      ibkrLoginError(
        "Upstream",
        "IBKR login: session handoff returned to login"
      )
    );
  }
  yield* updateState((current) => ({
    ...current,
    sessionKey: "",
    status: {
      state: "authenticated",
      username: current.status.username,
      expiresAt: now + authenticatedWindowMs,
    },
  }));
  // IBKR's web app calls sso/validate first, and its response sets the
  // load-balancer cookie that iserver/ and portfolio/ calls require ("No valid
  // lb cookie"). Doing it here saves that cookie with the login, so the
  // dashboard's parallel first calls don't race to get it.
  yield* Effect.ignore(ibkrPortalRequest("GET", "sso/validate"));
});

/** Moves to the second factor; a single offered factor is selected automatically. */
export const selectIbkrFactor = Effect.fn("IbkrLogin.selectFactor")(
  function* selectIbkrFactor(id: string) {
    const { status } = yield* currentState;
    if (
      status.state !== "chooseFactor" ||
      !status.factors?.some((factor) => factor.id === id)
    ) {
      return yield* Effect.fail(
        ibkrLoginError(
          "BadRequest",
          "IBKR login: invalid second factor selection"
        )
      );
    }
    const result = yield* authAction({
      ACTION: "COMPLETEAUTH_1",
      USER: yield* currentUsername,
      SF: id,
      VERSION: "1",
    });
    if (!result.push_sent) {
      return yield* Effect.fail(
        ibkrLoginError("Upstream", "IBKR login: push approval was not sent")
      );
    }
    const now = yield* Clock.currentTimeMillis;
    yield* updateState((state) => ({
      ...state,
      factor: id,
      status: {
        ...state.status,
        state: "secondFactor",
        expiresAt: now + secondFactorWindowMs,
      },
    }));
    return yield* ibkrLoginStatus;
  }
);

/**
 * The SRP handshake and server proof check. Every failure, IBKR's own refusals
 * included, becomes `ibkrCredentialsMessage`, so a wrong password, an unknown
 * or locked account and a username Nora refuses all look the same.
 */
const authenticate = Effect.fn("IbkrLogin.authenticate")(
  function* authenticate(username: string, password: string) {
    const { service } = yield* currentState;
    let parameters = ibkrSrpDefaults;
    for (let negotiation = 0; negotiation < 3; negotiation += 1) {
      const srp = yield* createIbkrSrp(parameters);
      const init = yield* authAction({
        ACTION: "INIT",
        USER: username,
        A: srp.A,
        SERVICE: service,
        LOGIN_TYPE: "1",
      });
      const next = {
        N: yield* requiredField(init, "N"),
        g: yield* requiredField(init, "g"),
        hash: yield* requiredField(init, "hash"),
        proto: yield* requiredField(init, "proto"),
      };
      if (
        next.N !== parameters.N ||
        next.g !== parameters.g ||
        next.hash !== parameters.hash ||
        next.proto !== parameters.proto
      ) {
        parameters = next;
        yield* Effect.sleep("500 millis");
        continue;
      }
      const proof = yield* srp.prove({
        username,
        // IBKR's legacy accounts only use the first eight characters unless `lp` is set.
        password: init.lp === true ? password : password.slice(0, 8),
        salt: yield* requiredField(init, "s"),
        serverPublic: yield* requiredField(init, "B"),
        rsaModulus: yield* requiredField(init, "rsapub"),
      });
      const complete = yield* authAction({
        ACTION: "COMPLETEAUTH",
        USER: username,
        M1: proof.M1,
        EKX: proof.EKX,
        VERSION: "1",
        LOGIN_TYPE: "1",
      });
      const serverProof = yield* requiredField(complete, "M2");
      if (
        !/^[\da-f]+$/iu.test(serverProof) ||
        BigInt(`0x${serverProof}`) !== BigInt(`0x${proof.M2}`)
      ) {
        return yield* Effect.fail(
          ibkrLoginError("Rejected", "IBKR login: server proof mismatch")
        );
      }
      return { complete, sessionKey: proof.sessionKey };
    }
    return yield* Effect.fail(
      ibkrLoginError(
        "Upstream",
        "IBKR login: authentication parameters kept changing"
      )
    );
  },
  (effect) =>
    effect.pipe(
      Effect.tapError((failure) =>
        Effect.logWarning("IBKR password step failed", failure.message)
      ),
      Effect.mapError(() => ibkrLoginError("Rejected", ibkrCredentialsMessage))
    )
);

/** Password step: SRP handshake, server proof check, then factor selection. */
export const startIbkrLogin = Effect.fn("IbkrLogin.start")(
  function* startIbkrLogin(inputUsername: string, password: string) {
    const username = inputUsername.includes("@")
      ? inputUsername.trim()
      : inputUsername.trim().toLowerCase();
    yield* updateState((state) => ({
      ...state,
      status: { state: "disconnected", username },
    }));
    yield* bootstrap;
    const { complete, sessionKey } = yield* authenticate(username, password);
    // Past this point the password was right, so errors can be specific.
    const disabled = new Set((complete.sf_disabled ?? []).map(String));
    const offered = (complete.sftypes ?? []).map(String);
    const factors = offered.flatMap((id) => {
      const label = factorLabels.get(id);
      return label && !disabled.has(id) ? [{ id, label }] : [];
    });
    if (offered.length > 0 && factors.length === 0) {
      return yield* Effect.fail(
        ibkrLoginError(
          "Rejected",
          "Your account uses an unsupported verification method."
        )
      );
    }
    yield* updateState((state) => ({ ...state, sessionKey }));
    if (factors.length === 0) {
      yield* finish;
      return yield* ibkrLoginStatus;
    }
    yield* updateState((state) => ({
      ...state,
      status: { ...state.status, state: "chooseFactor", factors },
    }));
    const [first] = factors;
    return factors.length === 1 && first
      ? yield* selectIbkrFactor(first.id)
      : yield* ibkrLoginStatus;
  }
);

/** Polls once for IB Key push approval and finishes the login once approved. */
export const pollIbkrApproval = Effect.gen(function* pollIbkrApproval() {
  const state = yield* currentState;
  const now = yield* Clock.currentTimeMillis;
  if (
    state.status.state !== "secondFactor" ||
    now >= (state.status.expiresAt ?? 0)
  ) {
    return yield* Effect.fail(
      ibkrLoginError("Unauthorized", "Verification timed out. Log in again.")
    );
  }
  const counter = state.counter + 1;
  yield* updateState((current) => ({ ...current, counter }));
  const result = yield* authAction({
    ACTION: "COMPLETETWOFACT",
    USER: yield* currentUsername,
    SF: state.factor,
    VERSION: "1",
    PUSH: "true",
    counter: String(counter),
  });
  if (result.auth_res) {
    yield* finish;
  }
  return yield* ibkrLoginStatus;
});

/** Ends the IBKR session; the local state is cleared even if IBKR is unreachable. */
export const logoutIbkr = Effect.gen(function* logoutIbkr() {
  const session = yield* IbkrBrowserSession;
  yield* authAction({ ACTION: "LOGOUT" }).pipe(
    Effect.ensuring(
      Effect.all([
        Ref.set(session.cookies, []),
        Ref.set(session.state, emptySessionState),
      ])
    )
  );
});
