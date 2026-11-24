import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import "varlock/auto-load";

import { ENV } from "./env";

/**
 * Cloudflare Access in front of the whole Worker (custom domains, routes,
 * `workers.dev` and preview URLs) when `ACCESS_EMAILS` lists anyone. People
 * sign in with any login method set up in the Zero Trust dashboard; the
 * policy only checks their email. Varlock requires the list in private mode.
 */
const access = ENV.ACCESS_EMAILS?.length
  ? {
      policies: [
        {
          decision: "allow" as const,
          include: ENV.ACCESS_EMAILS.map((email) => ({ email })),
        },
      ],
    }
  : undefined;

export default Alchemy.Stack(
  "nora",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* createWebStack() {
    // The API runs inside the TanStack Start Worker (apps/web/src/routes/api/$.ts).
    const webWorker = yield* Cloudflare.Website.Vite("web", {
      rootDir: "../../apps/web",
      env: {
        APP_ORIGIN: Config.String("APP_ORIGIN"),
        SESSION_SECRET: Config.Redacted("SESSION_SECRET"),
        IBKR_LOGIN_MODE: ENV.IBKR_LOGIN_MODE,
        IBKR_ALLOWED_USERNAME: Config.String("IBKR_ALLOWED_USERNAME").pipe(
          Config.withDefault("")
        ),
      },
      access,
      compatibility: {
        date: "2026-10-26",
      },
      dev: {
        port: 3000,
      },
    });

    return {
      web: webWorker.url,
    };
  })
);
