import { Clock, Effect, Option, Queue, Ref, Schema, Stream } from "effect";
import type { Cookies } from "effect/http";

import { isAllowedIbkrUrl } from "./ibkr-browser-http";
import {
  authenticatedIbkrState,
  IbkrBrowserSession,
} from "./ibkr-browser-login";
import { ibkrLoginError } from "./ibkr-login-error";
import type { IbkrLoginError } from "./ibkr-login-error";

/**
 * Live market data from IBKR's WebSocket, as IBKR's own web app streams it:
 * `smd+<conid>` subscriptions on `/portal.proxy/v1/portal/ws`, signed in by
 * the login's cookies. IBKR pushes each change as it happens, only the
 * fields that changed.
 */

/** One push for one subscription: `conidEx` is e.g. "265598@OVERNIGHT". */
export interface IbkrQuoteUpdate {
  readonly conidEx: string;
  readonly fields: Readonly<Record<string, string | number>>;
}

/**
 * What the stream yields: quote pushes, and a line now and then on the
 * connection itself (opened, IBKR's session status, closed and why), for
 * seeing why no quotes arrive. Never carries cookies or account details.
 */
export type IbkrMarketEvent =
  | ({ readonly _tag: "quote" } & IbkrQuoteUpdate)
  | { readonly _tag: "status"; readonly text: string };

/** How long after opening to subscribe anyway, if IBKR sends no system message first. */
const subscribeFallbackMs = 2000;

/** Keeps the connection, and with it the session, alive; IBKR's web sends it every 20s. */
const heartbeatMs = 20_000;

/** The login's cookies that IBKR's host would receive, as one header. */
const cookieHeader = (
  cookies: readonly Cookies.Cookie[],
  host: string,
  now: number
) =>
  cookies
    .filter(({ options }) => {
      const domain = options?.domain?.replace(/^\./u, "");
      const live = !options?.expires || options.expires.getTime() > now;
      return (
        live && (!domain || host === domain || host.endsWith(`.${domain}`))
      );
    })
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

const decodeMessage = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json))
);

const decodeTopic = Schema.decodeUnknownOption(
  Schema.Struct({ topic: Schema.String })
);
const decodeFieldValue = Schema.decodeUnknownOption(
  Schema.Union([Schema.String, Schema.Number])
);

/** A market-data push; other messages (system, heartbeat echoes) are skipped. */
export const parseIbkrQuoteMessage = (
  text: string
): IbkrQuoteUpdate | undefined => {
  const message = Option.getOrUndefined(decodeMessage(text));
  const topic = Option.getOrUndefined(decodeTopic(message))?.topic;
  if (!(message && topic?.startsWith("smd+"))) {
    return;
  }
  const fields: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(message)) {
    const value = Option.getOrUndefined(decodeFieldValue(raw));
    if (/^\d+$/u.test(key) && value !== undefined) {
      fields[key] = value;
    }
  }
  return Object.keys(fields).length > 0
    ? { conidEx: topic.slice("smd+".length), fields }
    : undefined;
};

const decodeSystem = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      topic: Schema.String,
      args: Schema.optional(
        Schema.Struct({
          authenticated: Schema.optional(Schema.Boolean),
          connected: Schema.optional(Schema.Boolean),
          competing: Schema.optional(Schema.Boolean),
        })
      ),
      error: Schema.optional(Schema.String),
    })
  )
);

/**
 * A short, account-free note on one of IBKR's non-quote messages: its topic,
 * the session flags `sts` carries, or an error. Undefined for heartbeats.
 */
export const ibkrSystemNote = (text: string) => {
  const message = Option.getOrUndefined(decodeSystem(text));
  if (!message || message.topic === "tic") {
    return;
  }
  const flags = Object.entries(message.args ?? {})
    .map(([flag, value]) => `${flag}=${String(value)}`)
    .join(" ");
  return [
    `IBKR ${message.topic}`,
    flags,
    message.error && `error: ${message.error}`,
  ]
    .filter(Boolean)
    .join(" ");
};

interface IbkrSocket {
  readonly socket: WebSocket;
  /** Set on Workers, where the socket starts delivering events once accepted. */
  readonly accept?: () => void;
}

/** Workers' reply to an `Upgrade: websocket` fetch; other runtimes lack `webSocket`. */
interface UpgradeResponse {
  readonly status: number;
  readonly webSocket?: (WebSocket & { accept: () => void }) | null;
}

/**
 * Opens the socket with the login's cookies in the handshake. Bun and Node
 * take handshake headers as a second constructor argument; the Workers
 * constructor rejects them, so on Cloudflare the handshake is a `fetch` with
 * `Upgrade: websocket`, as Cloudflare documents for outbound sockets.
 */
const connectIbkrSocket = async (
  endpoint: URL,
  headers: Readonly<Record<string, string>>
): Promise<IbkrSocket> => {
  if (navigator.userAgent !== "Cloudflare-Workers") {
    const socket: WebSocket = Reflect.construct(globalThis.WebSocket, [
      endpoint.href.replace(/^https:/u, "wss:"),
      { headers },
    ]);
    return { socket };
  }
  const response: UpgradeResponse = await fetch(endpoint, {
    headers: { ...headers, Upgrade: "websocket" },
  });
  const socket = response.webSocket;
  if (!socket) {
    throw new Error(`WebSocket upgrade refused (${response.status})`);
  }
  return { socket, accept: () => socket.accept() };
};

/**
 * Streams `fields` for each of `conidExes` (a conid, or one directed at a
 * venue such as "265598@OVERNIGHT") until IBKR closes the connection or the
 * stream is interrupted, when it unsubscribes and closes.
 */
export const ibkrQuoteStream = Effect.fn("IbkrMarket.quoteStream")(
  function* ibkrQuoteStream(
    conidExes: readonly string[],
    fields: readonly string[]
  ) {
    const session = yield* IbkrBrowserSession;
    const { dispatcher } = yield* authenticatedIbkrState;
    const endpoint = new URL("/portal.proxy/v1/portal/ws", dispatcher);
    // Session cookies may only travel to IBKR's hosts.
    if (!isAllowedIbkrUrl(endpoint.href)) {
      return yield* Effect.fail(
        ibkrLoginError("Upstream", "IBKR market data: rejected destination")
      );
    }
    const cookie = cookieHeader(
      yield* Ref.get(session.cookies),
      endpoint.hostname,
      yield* Clock.currentTimeMillis
    );
    const headers = { Cookie: cookie, Origin: endpoint.origin };
    const subscription = JSON.stringify({ fields });
    return Stream.callback<IbkrMarketEvent, IbkrLoginError>(
      (queue) => {
        const report = (text: string) =>
          Queue.offerUnsafe(queue, { _tag: "status", text });
        const listen = ({ socket, accept }: IbkrSocket) => {
          socket.binaryType = "arraybuffer";
          let heartbeat: ReturnType<typeof setInterval> | undefined;
          let fallback: ReturnType<typeof setTimeout> | undefined;
          let subscribed = false;
          // As IBKR's web client: once IBKR has said hello on the socket.
          const subscribe = () => {
            if (subscribed || socket.readyState !== WebSocket.OPEN) {
              return;
            }
            subscribed = true;
            for (const conidEx of conidExes) {
              socket.send(`smd+${conidEx}+${subscription}`);
            }
            report(`subscribed ${conidExes.join(", ")}`);
          };
          const opened = () => {
            report("connected to IBKR");
            heartbeat = setInterval(() => socket.send("ech+hb"), heartbeatMs);
            fallback = setTimeout(subscribe, subscribeFallbackMs);
          };
          socket.addEventListener("message", (event) => {
            const text =
              event.data instanceof ArrayBuffer
                ? new TextDecoder().decode(event.data)
                : String(event.data);
            const update = parseIbkrQuoteMessage(text);
            if (update) {
              Queue.offerUnsafe(queue, { _tag: "quote", ...update });
              return;
            }
            const note = ibkrSystemNote(text);
            if (note) {
              report(note);
              subscribe();
            }
          });
          const stop = () => {
            clearInterval(heartbeat);
            clearTimeout(fallback);
          };
          socket.addEventListener("close", (event) => {
            stop();
            report(
              `closed by IBKR (${event.code}${event.reason ? ` ${event.reason}` : ""})`
            );
            Queue.endUnsafe(queue);
          });
          socket.addEventListener("error", () => {
            stop();
            report("IBKR refused or dropped the connection");
            Queue.endUnsafe(queue);
          });
          if (accept) {
            // A Workers socket is open as soon as it is accepted.
            accept();
            opened();
          } else {
            socket.addEventListener("open", opened);
          }
          return { socket, stop };
        };
        return Effect.acquireRelease(
          Effect.tryPromise({
            try: () => connectIbkrSocket(endpoint, headers),
            catch: () =>
              ibkrLoginError(
                "Upstream",
                "IBKR market data: connection refused"
              ),
          }).pipe(Effect.map(listen)),
          ({ socket, stop }) =>
            Effect.sync(() => {
              stop();
              if (socket.readyState === WebSocket.OPEN) {
                for (const conidEx of conidExes) {
                  socket.send(`umd+${conidEx}+{}`);
                }
              }
              socket.close(1000);
            })
        );
      },
      // Only the latest pushes matter if the reader falls behind.
      { bufferSize: 64, strategy: "sliding" }
    );
  }
);
