import { IbkrLoginModeSchema } from "@nora/ibkr/browser-schemas";
import { Config, Effect, Layer, Redacted } from "effect";
import { FetchHttpClient, HttpRouter } from "effect/http";

import { makeIbkrLoginRoutes } from "./ibkr-login-routes";
import type { IbkrLoginConfig } from "./ibkr-login-routes";

/**
 * Every `/api/*` route, as one Effect HTTP router. Config is read from
 * `process.env`, which Cloudflare fills from the Worker's vars and secrets
 * (varlock injects them in `vite dev`).
 */
const apiLayer = Layer.unwrap(
  Effect.gen(function* loadApiConfig() {
    const secret = yield* Config.Redacted("SESSION_SECRET");
    // Demo unless the deployment says otherwise, so a missing variable can't
    // turn real logins on. Varlock validates both in dev.
    const mode = yield* Config.schema(
      IbkrLoginModeSchema,
      "IBKR_LOGIN_MODE"
    ).pipe(Config.withDefault("demo" as const));
    const login: IbkrLoginConfig =
      mode === "private"
        ? {
            mode,
            allowedUsername: yield* Config.NonEmptyString(
              "IBKR_ALLOWED_USERNAME"
            ),
          }
        : { mode };
    return makeIbkrLoginRoutes({
      secret: Redacted.value(secret),
      login,
    });
  })
).pipe(Layer.provide(FetchHttpClient.layer));

/**
 * Built once per server instance. Effect advises module scope on Workers so
 * the router's runtime is not tied to a single request.
 */
export const { handler: handleApiRequest } = HttpRouter.toWebHandler(apiLayer);
