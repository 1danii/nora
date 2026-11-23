import { Config, Effect, Layer, Redacted } from "effect";
import { FetchHttpClient, HttpRouter } from "effect/http";

import { makeIbkrLoginRoutes } from "./ibkr-login-routes";

/**
 * Every `/api/*` route, as one Effect HTTP router. Config is read from
 * `process.env`: varlock fills it in `vite dev`, and the Worker's env bindings
 * (set in `packages/infra/alchemy.run.ts`) fill it on Cloudflare.
 */
const apiLayer = Layer.unwrap(
  Effect.gen(function* loadApiConfig() {
    const origin = yield* Config.String("APP_ORIGIN");
    const secret = yield* Config.Redacted("SESSION_SECRET");
    const allowedUsername = yield* Config.String("IBKR_ALLOWED_USERNAME").pipe(
      Config.withDefault("")
    );
    return makeIbkrLoginRoutes({
      origin,
      secret: Redacted.value(secret),
      allowedUsername,
    });
  })
).pipe(Layer.provide(FetchHttpClient.layer));

/**
 * Built once per server instance. Effect advises module scope on Workers so
 * the router's runtime is not tied to a single request.
 */
export const { handler: handleApiRequest } = HttpRouter.toWebHandler(apiLayer);
