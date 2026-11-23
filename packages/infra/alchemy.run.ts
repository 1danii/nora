import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import "varlock/auto-load";

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
        IBKR_ALLOWED_USERNAME: Config.String("IBKR_ALLOWED_USERNAME").pipe(
          Config.withDefault("")
        ),
      },
      compatibility: {
        date: "2026-10-26",
        flags: ["temporal"],
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
