import {
  emptyIbkrBrowserSnapshot,
  IbkrBrowserSnapshotSchema,
} from "@nora/ibkr/browser-login";
import type { IbkrBrowserSnapshot } from "@nora/ibkr/browser-login";
import { ibkrDemoOnlyMessage } from "@nora/ibkr/browser-schemas";
import { ibkrDemoUsername } from "@nora/ibkr/demo";
import { ibkrLoginError } from "@nora/ibkr/login-error";
import type { IbkrLoginError } from "@nora/ibkr/login-error";
import { Clock, Effect, Schema } from "effect";

export const ibkrCookieName = "nora_ibkr";
/** Site-wide, so server-rendered page loaders can read the session too. */
export const ibkrCookiePath = "/";
const chunkSize = 3600;
const maxChunks = 6;
/** Pending 2FA state expires quickly; an authenticated session follows its own expiry. */
const defaultLifetimeMs = 300_000;
const maxLifetimeMs = 1_800_000;
const encoder = new TextEncoder();
const additionalData = encoder.encode("nora.ibkr.cookie.v1");

const EnvelopeSchema = Schema.fromJsonString(
  Schema.Struct({
    expiresAt: Schema.Number,
    snapshot: IbkrBrowserSnapshotSchema,
  })
);

const chunkName = (index: number) =>
  index === 0 ? ibkrCookieName : `${ibkrCookieName}_${index}`;

const base64url = (value: Uint8Array) =>
  btoa(String.fromCodePoint(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/[=]+$/u, "");
const decodeBase64url = (value: string) =>
  Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (character) => character.codePointAt(0) ?? 0
  );

/** A cookie to set on the response; `maxAge` 0 deletes it. */
export interface IbkrCookieWrite {
  readonly name: string;
  readonly value: string;
  readonly maxAgeSeconds: number;
}

/** Reads and writes the session snapshot kept in the browser's cookies. */
export interface IbkrSessionCookie {
  /** Returns null for a missing, invalid or expired cookie. */
  readonly read: (
    cookies: Readonly<Record<string, string>>
  ) => Effect.Effect<IbkrBrowserSnapshot | null>;
  readonly write: (
    snapshot: IbkrBrowserSnapshot
  ) => Effect.Effect<readonly IbkrCookieWrite[], IbkrLoginError>;
}

/** How long a demo session lasts without activity, like a real one. */
export const ibkrDemoWindowMs = 30 * 60_000;

/** A signed-in demo session: no IBKR cookies, just the authenticated status. */
export const ibkrDemoSnapshot = (expiresAt: number): IbkrBrowserSnapshot => ({
  ...emptyIbkrBrowserSnapshot,
  status: {
    state: "authenticated",
    username: ibkrDemoUsername,
    expiresAt,
    demo: true,
  },
});

/** Deletes every chunk, for sign-out. */
export const clearIbkrSessionCookie = (): readonly IbkrCookieWrite[] =>
  Array.from({ length: maxChunks }, (_, index) => ({
    name: chunkName(index),
    value: "",
    maxAgeSeconds: 0,
  }));

/**
 * Encrypts vendor cookies and pending 2FA state into chunked AES-GCM cookies.
 * The password is never part of a snapshot.
 */
export const makeIbkrSessionCookie = Effect.fn("IbkrSessionCookie.make")(
  function* makeIbkrSessionCookie(secret: string) {
    if (secret.length < 32) {
      return yield* Effect.die(
        new Error(
          "IBKR cookie: SESSION_SECRET must contain at least 32 characters"
        )
      );
    }
    const key = yield* Effect.promise(async () => {
      const material = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        "HKDF",
        false,
        ["deriveKey"]
      );
      return crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: encoder.encode("nora.ibkr.session.v1"),
          info: encoder.encode("cookie encryption"),
        },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    });

    /** Returns null for a missing, tampered, differently keyed or expired cookie. */
    const read = (cookies: Readonly<Record<string, string>>) =>
      Effect.gen(function* readIbkrSessionCookie() {
        const first = cookies[ibkrCookieName];
        if (!first) {
          return null;
        }
        const separator = first.indexOf(".");
        const count = Number(first.slice(0, separator));
        if (!Number.isInteger(count) || count < 1 || count > maxChunks) {
          return null;
        }
        let token = first.slice(separator + 1);
        for (let index = 1; index < count; index += 1) {
          const chunk = cookies[chunkName(index)];
          if (!chunk) {
            return null;
          }
          token += chunk;
        }
        const bytes = decodeBase64url(token);
        const plaintext = yield* Effect.tryPromise(() =>
          crypto.subtle.decrypt(
            { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData },
            key,
            bytes.slice(12)
          )
        );
        const envelope = yield* Schema.decodeUnknownEffect(EnvelopeSchema)(
          new TextDecoder().decode(plaintext)
        );
        const now = yield* Clock.currentTimeMillis;
        return envelope.expiresAt > now ? envelope.snapshot : null;
      }).pipe(Effect.orElseSucceed(() => null));

    const write = Effect.fn("IbkrSessionCookie.write")(function* write(
      snapshot: IbkrBrowserSnapshot
    ) {
      const now = yield* Clock.currentTimeMillis;
      const expiresAt = Math.min(
        snapshot.status.expiresAt ?? now + defaultLifetimeMs,
        now + maxLifetimeMs
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = new Uint8Array(
        yield* Effect.promise(() =>
          crypto.subtle.encrypt(
            { name: "AES-GCM", iv, additionalData },
            key,
            encoder.encode(JSON.stringify({ expiresAt, snapshot }))
          )
        )
      );
      const bytes = new Uint8Array(iv.length + ciphertext.length);
      bytes.set(iv);
      bytes.set(ciphertext, iv.length);
      const token = base64url(bytes);
      const count = Math.ceil(token.length / chunkSize);
      if (count > maxChunks) {
        return yield* Effect.fail(
          ibkrLoginError(
            "Upstream",
            "IBKR cookie: upstream session exceeds browser cookie capacity"
          )
        );
      }
      const maxAgeSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
      return Array.from({ length: maxChunks }, (_, index): IbkrCookieWrite =>
        index < count
          ? {
              name: chunkName(index),
              value: `${index === 0 ? `${count}.` : ""}${token.slice(index * chunkSize, (index + 1) * chunkSize)}`,
              maxAgeSeconds,
            }
          : { name: chunkName(index), value: "", maxAgeSeconds: 0 }
      );
    });

    return { read, write } satisfies IbkrSessionCookie;
  }
);

const demoPrefix = "demo.";

/**
 * The session cookie of a demo deployment, which needs no secret: it holds
 * only a demo session's expiry, as `demo.<expiresAt>`, and always reads back
 * as a demo session. Forging it can at most keep a demo session open for
 * another window; it can never carry IBKR cookies or reach IBKR. Any other
 * snapshot is refused rather than stored.
 */
export const ibkrDemoSessionCookie: IbkrSessionCookie = {
  read: (cookies) =>
    Effect.gen(function* readIbkrDemoSessionCookie() {
      const now = yield* Clock.currentTimeMillis;
      const value = cookies[ibkrCookieName];
      if (!value?.startsWith(demoPrefix)) {
        return null;
      }
      const expiresAt = Number(value.slice(demoPrefix.length));
      return Number.isSafeInteger(expiresAt) &&
        expiresAt > now &&
        expiresAt <= now + ibkrDemoWindowMs
        ? ibkrDemoSnapshot(expiresAt)
        : null;
    }),
  write: Effect.fn("IbkrDemoSessionCookie.write")(function* write(
    snapshot: IbkrBrowserSnapshot
  ) {
    const { demo, expiresAt } = snapshot.status;
    if (!demo || expiresAt === undefined) {
      return yield* Effect.fail(
        ibkrLoginError("Forbidden", ibkrDemoOnlyMessage)
      );
    }
    const now = yield* Clock.currentTimeMillis;
    const capped = Math.min(Math.floor(expiresAt), now + ibkrDemoWindowMs);
    return [
      {
        name: ibkrCookieName,
        value: `${demoPrefix}${capped}`,
        maxAgeSeconds: Math.max(0, Math.floor((capped - now) / 1000)),
      },
      ...clearIbkrSessionCookie().slice(1),
    ];
  }),
};
