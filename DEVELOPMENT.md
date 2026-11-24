# Developing nora

Setup, architecture and scripts for working on the code. Deploying is in the [README](README.md#deploy-by-hand).

This project was scaffolded with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack): React, TanStack Start, StyleX and Effect v4 on Bun, deployed as one Cloudflare Worker.

## Getting Started

1. Install the dependencies:

   ```bash
   bun install
   ```

2. Copy `apps/web/.env.example` to `apps/web/.env`. It runs in demo mode by default, which needs nothing else; for a real IBKR login, set `IBKR_LOGIN_MODE=private`, `IBKR_ALLOWED_USERNAME` to your IBKR username and `SESSION_SECRET` to a random secret of at least 32 characters.

3. Run the development server:

   ```bash
   bun run dev
   ```

Open [http://localhost:3000](http://localhost:3000) in your browser. The API is part of the same TanStack Start app, under `/api/*`.

`bun run dev` runs `vite dev` in `apps/web`. The app runs in the Workers runtime (`@cloudflare/vite-plugin`), and Varlock's plugin validates `apps/web/.env` and passes it to the Worker, where server code reads it from `process.env`.

## Effect API

The app pins Effect packages and Drizzle ORM/Kit prereleases. Upgrade them together and preserve the lockfile.

- `apps/web/src/routes/api/$.ts` is a TanStack Start server route that hands every `/api/*` request to one Effect `HttpRouter` (`apps/web/src/api/api-handler.server.ts`), built once per server instance with `HttpRouter.toWebHandler`.
- `apps/web/src/api/ibkr-login-routes.ts` defines the IBKR login routes at `/api/ibkr/*`. Settings are read with Effect `Config` from `process.env`.
- The backend is Effect throughout: IBKR calls use Effect's `HttpClient` (with its cookie jar and redirect handling), and request bodies, vendor responses and cookie envelopes are decoded with Effect Schema.
- `apps/web/src/lib/ibkr-login-queries.ts` calls those routes and decodes responses with the shared schemas from `@nora/ibkr/browser-schemas`. In the browser it uses `fetch`; during SSR it calls the Effect handler in-process with the page request's cookies.
- The whole app uses `ssr: "data-only"`: route loaders run on the server for the first page load, components render only in the browser. `@tanstack/react-router-ssr-query` passes the loaded query data to the browser.
- `packages/db/src/effect-database.ts` provides `EffectDatabase`. Nothing uses it yet. To add it, provide its layer to the API layer and add a Hyperdrive binding to `wrangler.jsonc`.

`packages/ibkr` holds the IBKR browser login, response schemas, market stream and demo data. See [packages/ibkr/README.md](packages/ibkr/README.md).

References: [Effect v4 beta](https://effect.website/blog/releases/effect/40-beta) and [Drizzle Effect PostgreSQL](https://orm.drizzle.team/docs/connect-effect-postgres). The installed package source (`bunx opensrc path effect`) is authoritative for API signatures.

## App Routes

`/login` provides the IBKR username/password and second-factor flow; the dashboard lives under `/dashboard`.

The app's own `/api/ibkr/*` routes handle the login. Vendor cookies and unfinished 2FA state are retained in encrypted HttpOnly cookies (`Path=/`, so server-side loaders can read them), using a key derived from `SESSION_SECRET`. Only `IBKR_ALLOWED_USERNAME` may sign in. A demo deployment has no real logins, so its cookie holds only the demo session's expiry, needs no secret, and always reads back as a demo session. No database table, Durable Object, extra server, or OAuth key is needed. POSTs to `/api` must come from the same origin as the request. Passwords are not persisted.

The implementation has offline protocol tests but has not been verified with a live IBKR login or deployed. The user API action may require additional vendor context; the homepage reports that test's failure separately from authentication. This does not yet establish access to portfolio endpoints.

Styling uses [StyleX](https://stylexjs.com). Tokens live in `apps/web/src/styles`: `tokens.stylex.ts` (Radix gray with dark variants, black/white alpha, black and white, Display P3 with an sRGB fallback; breakpoints, radius and fonts), `stylex.env.spacing(n)` for multiples of 4px, and `global.css` for the reset. The app is always dark (`color-scheme: dark` in `global.css`); tokens keep light values through `light-dark()` in case a light theme is added. The primitives in `apps/web/src/components/ui` are unstyled [Base UI](https://base-ui.com) wrappers adapted from shadcn/ui's Base UI registry; style them by passing `stylex.props(...)`.

## Environment Configuration

Each app owns its environment schema in `.env.schema`. Varlock generates `src/env.ts` during installation; run `bun run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Import the generated `ENV` accessor in application code. The shared database package receives its configuration from the application. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

Varlock checks the env in local dev only. Deployed, the Worker reads its own vars and secrets from `process.env`: builds use the plain Cloudflare plugin, so whatever sets them (the Deploy button, the dashboard, `wrangler secret put`) is the source of truth.

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

## Project Structure

```
nora/
├── wrangler.jsonc   # The Cloudflare Worker
├── apps/
│   └── web/         # TanStack Start app, with the Effect API in src/api
├── packages/
│   ├── ibkr/        # IBKR browser login and schemas
│   └── db/          # Database schema, unused for now
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run deploy`: Deploy the built Worker (run `bun run build` first)
- `bun run check-types`: Check TypeScript types across all apps
