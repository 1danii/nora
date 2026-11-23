import { Schema } from "effect";

/** Required text with a length cap; the messages are shown in the login form. */
const requiredText = (name: string, maxLength: number) =>
  Schema.String.pipe(
    Schema.check(Schema.isNonEmpty({ message: `Enter your ${name}.` })),
    Schema.check(
      Schema.isMaxLength(maxLength, {
        message: `Use at most ${maxLength} characters.`,
      })
    )
  );

/** Body of `/api/ibkr/start`, also the sign-in form's validator. */
export const IbkrLoginStartSchema = Schema.Struct({
  username: requiredText("username", 128),
  password: requiredText("password", 256),
});
export type IbkrLoginStart = typeof IbkrLoginStartSchema.Type;

/** Body of `/api/ibkr/factor`. */
export const IbkrLoginFactorSchema = Schema.Struct({
  factor: requiredText("verification method", 16),
});

/** Login progress shown in the browser, without vendor session secrets. */
export const IbkrLoginStatusSchema = Schema.Struct({
  state: Schema.Literals([
    "disconnected",
    "chooseFactor",
    "secondFactor",
    "authenticated",
  ]),
  username: Schema.optional(Schema.String),
  factors: Schema.optional(
    Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String }))
  ),
  expiresAt: Schema.optional(Schema.Number),
  /** A "Try demo" session: fixture data, never connected to IBKR. */
  demo: Schema.optional(Schema.Boolean),
});
export type IbkrLoginStatus = typeof IbkrLoginStatusSchema.Type;

/** A Client Portal API response passed through Nora: IBKR's status and body. */
export const IbkrPortalResponseSchema = Schema.Struct({
  status: Schema.Number,
  body: Schema.Json,
});
export type IbkrPortalResponse = typeof IbkrPortalResponseSchema.Type;

/**
 * Shown for login failures the person cannot act on (IBKR outages, protocol
 * changes, unreadable responses). The API logs the real cause.
 */
export const ibkrGenericLoginMessage =
  "Couldn't log in. Try again in a moment.";

/** Error body of every failed `/api/ibkr/*` response. */
export const IbkrApiErrorSchema = Schema.Struct({ error: Schema.String });

/**
 * The `/tws.proxy/` namespaces Nora reads: company fundamentals, news,
 * `impact`, the popular lists IBKR's GlobalTrader app shows, and `hmds`, the
 * Client Portal's Market Screener.
 */
export type IbkrResearchNamespace =
  | "fundamentals"
  | "news2"
  | "impact"
  | "hmds";
