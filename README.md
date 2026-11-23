# nora

This project was scaffolded with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack) and uses React, TanStack Start, and Effect v4.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **StyleX** - Compile-time CSS-in-JS with Radix color tokens
- **Effect v4 prerelease** - HTTP server, HTTP client, schemas and scoped database services
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - your IBKR login (username, password and 2FA), kept in an encrypted HttpOnly cookie
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. If `apps/web/.env` does not exist, copy it from `apps/web/.env.example`. Set `SESSION_SECRET` to a random secret of at least 32 characters and `IBKR_ALLOWED_USERNAME` to your IBKR username. `DATABASE_URL` is only needed for the Drizzle commands.

3. Apply the schema to your database:

```bash
bun run db:push
```

Local databases initialized with `db:push` do not have Drizzle migration history. Keep using `db:push` for those databases; use `db:migrate` on a fresh database managed by migrations from the start.

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The API is part of the same TanStack Start app, under `/api/*`.

`bun run dev` runs `varlock run -- vite dev` in `apps/web`, so the settings in `apps/web/.env` reach the server code through `process.env`. It does not require Alchemy cloud credentials.

`APP_ORIGIN` defaults to `http://localhost:3000`. Override it for deployed environments: POSTs to `/api` must come from that origin.

## Effect API

The app and infrastructure pin Effect packages to `4.1.4` and Alchemy to `2.0.0-beta.87`, with Drizzle ORM/Kit `1.0.0-rc.5-ab785fc`. Keep the Worker compatibility date at or before the `workerd` release Alchemy bundles. Upgrade these prereleases together and preserve the lockfile.

- `apps/web/src/routes/api/$.ts` is a TanStack Start server route that hands every `/api/*` request to one Effect `HttpRouter` (`apps/web/src/api/api-handler.server.ts`), built once per server instance with `HttpRouter.toWebHandler`.
- `apps/web/src/api/ibkr-login-routes.ts` defines the IBKR login routes at `/api/ibkr/*`. Settings are read with Effect `Config` from `process.env`.
- The backend is Effect throughout: IBKR calls use Effect's `HttpClient` (with its cookie jar and redirect handling), and request bodies, vendor responses and cookie envelopes are decoded with Effect Schema.
- `apps/web/src/lib/ibkr-login-queries.ts` calls those routes and decodes responses with the shared schemas from `@nora/ibkr/browser-schemas`. In the browser it uses `fetch`; during SSR it calls the Effect handler in-process with the page request's cookies.
- The whole app uses `ssr: "data-only"`: route loaders run on the server for the first page load, components render only in the browser. `@tanstack/react-router-ssr-query` passes the loaded query data to the browser.
- `packages/db/src/effect-database.ts` provides `EffectDatabase`. Nothing uses it yet. To add it, provide its layer to the API layer and bind Hyperdrive in `packages/infra/alchemy.run.ts`.

`packages/ibkr` holds the IBKR browser login, response schemas, market stream and demo data. See [packages/ibkr/README.md](packages/ibkr/README.md).

References: [Effect v4 beta](https://effect.website/blog/releases/effect/40-beta) and [Drizzle Effect PostgreSQL](https://orm.drizzle.team/docs/connect-effect-postgres). The installed package source (`bunx opensrc path effect`) is authoritative for API signatures.

## App Routes

`/login` now provides a minimal IBKR username/password and second-factor flow. `/` displays the login username and separately calls IBKR's login-service user API to test the session and show the returned user ID. These are the only two pages; there is no portfolio UI yet.

The app's own `/api/ibkr/*` routes handle the login. Vendor cookies and unfinished 2FA state are retained in encrypted HttpOnly cookies (`Path=/`, so server-side loaders can read them), using a key derived from `SESSION_SECRET`. Only `IBKR_ALLOWED_USERNAME` may sign in. No database table, Durable Object, extra server, or OAuth key is needed. Set `APP_ORIGIN` to the actual web origin for the mutation origin check. Passwords are not persisted.

The implementation has offline protocol tests but has not been verified with a live IBKR login or deployed. The user API action may require additional vendor context; the homepage reports that test's failure separately from authentication. This does not yet establish access to portfolio endpoints.

Styling uses [StyleX](https://stylexjs.com). Tokens live in `apps/web/src/styles`: `tokens.stylex.ts` (Radix gray with dark variants, black/white alpha, black and white, Display P3 with an sRGB fallback; breakpoints, radius and fonts), `stylex.env.spacing(n)` for multiples of 4px, and `global.css` for the reset. The app is always dark (`color-scheme: dark` in `global.css`); tokens keep light values through `light-dark()` in case a light theme is added. The primitives in `apps/web/src/components/ui` are unstyled [Base UI](https://base-ui.com) wrappers adapted from shadcn/ui's Base UI registry; style them by passing `stylex.props(...)`.

## Environment Configuration

Each app owns its environment schema in `.env.schema`. Varlock generates `src/env.ts` during installation; run `bun run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Import the generated `ENV` accessor in application code. The shared database package receives its configuration from the application. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

For Cloudflare, Alchemy loads and validates deployment inputs with `varlock/auto-load` in its Node/Bun deployment process. Worker code reads native bindings, while web clients use same-origin URLs and need no runtime environment bindings. Alchemy supplies resource URLs and managed database credentials. In-Worker Varlock protections are deferred until an official Alchemy integration is available; see [the non-Wrangler deployment guidance](https://varlock.dev/integrations/cloudflare/#non-wrangler-deploy-tools-alchemy-sst-pulumi).

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

## Deployment

### Alchemy

- Target: one Cloudflare Worker that serves the TanStack Start app and its Effect API
- Configure provider accounts: `cd packages/infra && bunx alchemy profile edit`
- Cloudflare development: `bun run dev:infra` (use instead of the local Vite process; both use port 3000)
- Deploy: bun run deploy
- Destroy: bun run destroy

`alchemy profile edit` stores the selected Axiom, Cloudflare, Neon, PlanetScale, and/or Prisma provider profiles under `~/.alchemy`; no provider-specific setup command is required by this scaffold.

The app stores nothing: IBKR data is fetched live, and the login session lives in encrypted cookies. The database package stays for later but is not deployed.

Before deploying, configure `APP_ORIGIN` as the public web origin and supply `SESSION_SECRET` and `IBKR_ALLOWED_USERNAME`. Alchemy binds them to the Worker (the secret as a secret), where they appear in `process.env`.

Deploys are staged and default to a personal `dev_<username>` stage. For production, run the deploy with an explicit stage from `packages/infra`:

```bash
cd packages/infra && bunx alchemy deploy --stage production
```

## Project Structure

```
nora/
├── apps/
│   └── web/         # TanStack Start app, with the Effect API in src/api
├── packages/
│   ├── ibkr/        # IBKR browser login and schemas
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:infra`: Start Alchemy's Cloudflare development workflow
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate a SQL migration from schema changes
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
