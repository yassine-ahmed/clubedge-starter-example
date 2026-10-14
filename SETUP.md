# Setup guide

This guide covers local development and provider setup. Start with the [README](README.md) for the architecture overview.

## Install the toolchain

Install Node.js 22.12 or newer, then enable Corepack and install pnpm dependencies from the repository root:

```sh
corepack enable
pnpm install
```

The root `package.json` pins pnpm 10.9.0 through its `packageManager` field. Use a compatible pnpm 10 release if Corepack is not available.

If pnpm reports that it ignored a package build script needed by your environment, review the package name and approve only the required dependency with `pnpm approve-builds`.

## Configure the local environment

Copy `.env.example` to `apps/web/.env.local`.

PowerShell:

```powershell
Copy-Item .env.example apps/web/.env.local
```

macOS/Linux:

```sh
cp .env.example apps/web/.env.local
```

The example file points at the local services described in [Local services](#local-services) and leaves provider keys blank, so the app builds and starts before anything is configured.

The variables are:

- `DATABASE_URL` (required): PostgreSQL connection URL, such as a Supabase transaction pooler URL.
- `NEXT_PUBLIC_APP_URL` (recommended): the app's origin, defaulting to `http://localhost:3000`.
- `BETTER_AUTH_SECRET` (for sign-in): see [Better Auth](#better-auth).
- `REDIS_URL` (optional): see [Redis](#redis).
- `SMTP_URL` and `EMAIL_FROM` (for sending email): see [Email](#email).
- `STORAGE_*` (for file storage): see [File storage](#file-storage).

`DATABASE_URL` must be a non-empty string for server environment validation. If you are only exploring the UI, a local placeholder URL works, but database operations fail until it points to a real PostgreSQL database.

Start the development server:

```sh
pnpm dev
```

The app is available at <http://localhost:3000>, the liveness endpoint at <http://localhost:3000/api/health>, and the readiness endpoint, which also checks the database, at <http://localhost:3000/api/ready>.

## Better Auth

Better Auth keeps users, passwords, and sessions in your PostgreSQL database, in its own `auth_*` tables with a separate migration history (`packages/auth-better-auth/drizzle`). Set `DATABASE_URL` and apply the migrations (see [Set up the database](#set-up-the-database)), then set a secret of at least 32 random characters:

```sh
openssl rand -base64 32
```

Put the result in `BETTER_AUTH_SECRET`. Until it is set, the dashboard stays viewable as a demo and the login page explains what is missing; once it is set, the dashboard redirects signed-out visitors to the login page. Signing in again on another device creates another session row, and signing out deletes it.

Better Auth sends its emails through the [email module](#email):

- **Password reset:** "Forgot password?" on the login page emails a link to `/reset-password`, valid for one hour and usable once.
- **Email verification:** every new account gets a confirmation link. Sign-up signs the user in right away unless `BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION=true`, which refuses sign-in until the link is opened.

## Local services

This project runs its development services without Docker or any other installation:

- **PostgreSQL:** `pnpm dev` also starts [PGlite](https://pglite.dev), PostgreSQL compiled to WebAssembly, and serves it on `127.0.0.1:5433`. Each start applies the migrations. Data is kept in `.data/pglite`. `pnpm infra:up` runs the database on its own, for `pnpm check:services` or browser tests.
- **Files:** while `STORAGE_DIRECTORY` is set, uploads are stored in that folder (`.data/storage`) instead of S3. Set the S3 variables and remove `STORAGE_DIRECTORY` to use object storage.
- **Cache:** without `REDIS_URL`, the cache and rate limits use process memory.
- **Email:** without a provider configured, emails are printed to the `pnpm dev` output, links included.

PGlite runs a single database session, so connections take turns. That is plenty for development but not for production: deploy against a managed PostgreSQL by setting `DATABASE_URL`. Supabase Auth and Supabase Storage need a Supabase project, local or hosted. Better Auth works fully offline. `pnpm infra:reset` deletes everything in `.data/`.

## Set up the database

Application tables are managed with Drizzle. Keep one migration source of truth for application tables: do not also create an independent Supabase migration history for those same tables.

From the repository root:

```sh
pnpm db:check
pnpm db:generate
pnpm db:migrate
```

`db:generate` creates migration files from `packages/db/src/schema` into `packages/db/drizzle`; review and commit those files. Better Auth's tables have their own schema and migrations in `packages/auth-better-auth`, applied by the same commands.

`db:migrate` applies committed migrations. `db:push` is available for local development, but do not use it as a production migration workflow. Use `pnpm db:seed` only against a database where seed data is appropriate. The database commands run in `packages/db` and read `DATABASE_URL` from `apps/web/.env.local`, so the project keeps one environment file. The Postgres.js client is configured with `prepare: false` for compatibility with Supabase transaction pooling.

## Redis

Redis is optional. Set `REDIS_URL` to a TCP connection URL:

```dotenv
REDIS_URL=rediss://default:<password>@<host>:6379
```

Use `rediss://` for TLS connections such as Upstash and `redis://` for an unencrypted connection on a trusted network. The app uses the standard Redis protocol and requires a Node.js runtime with outbound TCP access.

Without `REDIS_URL`, the rate limiter and cache use process memory. Memory limits apply per server process, so configure Redis when you run several instances or serverless functions. Never commit a real Redis URL or password.

## Email

The app sends email through the `EmailProvider` in `apps/web/src/server/email.ts`. Server code imports `email` from `@/server/email` and calls `email.send({ to, subject, text, html })`.

Set `SMTP_URL` to any SMTP server, for example `smtps://user:password@smtp.example.com:465`, and `EMAIL_FROM` to the sender, as `Name <address>` or an address. Most email providers (Resend, Postmark, Amazon SES, SendGrid, Mailgun) offer an SMTP endpoint.

Without a provider configured, development prints each email to the server log, so you can open links from the terminal, and production refuses to send. `pnpm check:services` confirms that the provider accepts the settings without sending anything.

## File storage

The storage adapter works with AWS S3 and S3-compatible providers such as Cloudflare R2 and MinIO. Configure `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ENDPOINT` when required, and the access key, secret, and optional public URL. For R2, use the account's S3 API endpoint and region `auto`.

The storage adapter does not authorize users or validate uploads. Before calling it, the route must check ownership and authorization, file size, content type, and the object key. Keep credentials server side.

## Shared UI development

The app's `components.json` and `packages/ui/components.json` direct the shadcn CLI into the shared `packages/ui` package. The selected `base-nova` style uses `@base-ui/react` primitives, not Radix UI. Tailwind CSS 4 and semantic theme tokens are defined in `packages/ui/src/styles/globals.css` and imported by the app's root route.

Generate a shared component from the repository root:

```sh
pnpm dlx shadcn@latest add badge -c apps/web
```

Shared components live in `packages/ui/src/components` and are imported from `@clubedge/ui/components/<component>`. Keep both `components.json` files aligned when changing the shadcn style, Tailwind CSS entry, base color, icon library, or RTL setting. The `rtl` setting makes newly generated components RTL-aware; set `lang` and `dir` on the root `<html>` element to match your application's actual locale. App-specific components belong in `apps/web/src/components`.

The root route is a public landing page; the reference dashboard is available at `/dashboard`. The dashboard uses the shared shadcn sidebar and breadcrumb. A light/dark switch is available in the landing page and dashboard navigation; its choice is saved in local storage and the initial theme follows the system preference until the user selects one. Theme colors are centralized in `packages/ui/src/styles/globals.css` (blue `#2563eb`, dark background `#151515`).

## Docker

Create `apps/web/.env.local` first. Start the development image with:

```sh
pnpm docker:dev
```

Build a production image and run it with:

```sh
pnpm docker:build
pnpm docker:start
```

The image runs the Next.js standalone output as an unprivileged user. Ensure the configured database and provider hosts are reachable from the container.

The image also contains the production migrator, which applies every package's migrations with only `DATABASE_URL`:

```sh
docker run --rm --env DATABASE_URL="postgresql://..." <image> node /app/migrate.mjs
```

Run it before a new version starts serving; it skips migrations that are already applied.

## Deploy

`railway.json` deploys the production image to [Railway](https://railway.com): create a project from this repository, add the production variables listed below to the service, and deploy. Railway runs `node /app/migrate.mjs` as the pre-deploy command, so a failed migration stops the release, and checks `/api/health` before switching traffic.

`.github/workflows/deploy.yml` deploys on demand: in GitHub, open Actions, then Deploy, then Run workflow.

- It needs the secret `RAILWAY_TOKEN`, a project token from the project's settings, and the variable `RAILWAY_SERVICE`, the service's name.

`/api/health` answers as long as the app runs, so platforms use it to decide whether to restart the app. `/api/ready` also checks that the database answers, returning 200 or 503 without details: point load balancers and readiness probes at it, so traffic waits while the database is unreachable instead of the app restarting.

Production needs these variables:

- `DATABASE_URL`, pointing at a managed PostgreSQL database.
- `NEXT_PUBLIC_APP_URL`, the deployed origin.
- `BETTER_AUTH_SECRET`, at least 32 random characters, different from development.
- `SMTP_URL` and `EMAIL_FROM`; without them, production refuses to send email.
- `REDIS_URL`, when you run more than one instance.
- The `STORAGE_*` variables for your S3-compatible bucket.

## Checks

`pnpm clubedge doctor` checks that the project can run: Node.js and pnpm versions, installed dependencies, the lockfile, and `apps/web/.env.local` against the example, followed by `pnpm check:services`. Start there when something does not work.

Run the checks relevant to your change before opening a pull request:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

Browser checks use Playwright. Install Chromium once, then run `pnpm test:e2e`:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

The Playwright configuration starts the local app with a placeholder database URL; browser scenarios should not require real provider credentials.

## Before deploying

This project is a starting point; review the security and operational choices for your application before production use:

- Set production environment variables through your hosting provider's secret manager. Use unique, rotated credentials and TLS for external connections.
- Make authenticated server routes call `getCurrentUser()` or `requireUser()` from `@/server/auth` (the latter throws a 401 `AppError`), and protect pages with `getPageUser`, which redirects signed-out visitors to `/login`. Do not treat cookie contents alone as proof of identity.
- Authorize storage access and validate upload size, content type, and object ownership in the route before using the storage adapter.
- Configure Redis for rate limiting when you deploy more than one instance; the in-memory fallback does not share counts between instances.
- Client addresses come from `x-forwarded-for`, so deploy behind a proxy that sets it.
- Configure and verify a restrictive Content Security Policy for the scripts and asset origins used by your deployment. A generic policy is not included because it can break framework tooling and project-specific assets.
- Review database migration and backup procedures, provider access policies, and application-specific error handling.

## Troubleshooting

- **Environment validation fails:** confirm you copied the example to `apps/web/.env.local` and set `DATABASE_URL`. The error names the module whose variables are invalid.
- **Database connection fails:** check the URL, network access, and whether your provider expects a transaction pooler. Keep `prepare: false` for the current Supabase pooler setup.
- **Redis cannot connect:** check that the URL uses `redis://` or `rediss://`, credentials are current, and outbound TCP access is allowed.
- **Playwright cannot find Chromium:** run `pnpm exec playwright install chromium`.
- **A package file appears missing after an offline install:** retry with a normal registry-backed `pnpm install`; an incomplete local package cache can satisfy offline resolution while leaving package contents incomplete.
