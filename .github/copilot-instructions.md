# Copilot instructions

## Project overview

Daily AI Assistant is a React + TypeScript productivity app backed by an Express API and PostgreSQL via Prisma. The Vite client runs on port 5173 and proxies `/api` requests to the server on port 4000 during development.

- `client/src/App.tsx` owns the signed-in application shell and selects the feature page; feature UI lives in `client/src/pages/`, with reusable UI and auth components in `client/src/components/`.
- `client/src/lib/api.ts` is the shared browser API client. It adds the `/api` prefix, sends the HTTP-only session cookie, and turns non-success responses into errors. Use it rather than adding ad hoc `fetch` calls.
- `server/src/index.ts` currently contains the Express middleware, authentication, validation, and API route handlers. It uses Prisma for persistence and OpenAI from the server for AI requests; keep provider credentials server-side.
- `prisma/schema.prisma` defines the PostgreSQL data model. `UserPreferences` stores account-level settings, including JSON UI customization; `client/src/lib/appearance.ts` normalizes customization data and supplies defaults.
- Database changes belong in Prisma migrations as well as the schema. The README describes applying migrations and seeding a development database.

## Commands

Run from the repository root unless noted:

```bash
npm install
npm install --prefix client
npx prisma generate
npx prisma migrate dev --name <migration-name>
npm run seed
npm run dev
npm run build
```

`npm run dev` starts the API and Vite client together. `npm run build` compiles the server and builds the client. To build only one side, use `npm run build:server` or `npm --prefix client run build`.

There is currently no configured test runner, test script, or lint script, and no repository test files. Consequently, there is no single-test command; use the relevant build/type-check command to validate changes until a test runner is added.

## Repository-specific conventions

- API route paths in `server/src/index.ts` include `/api`; client calls through `api()` pass paths such as `"/tasks"` without that prefix.
- Validate request bodies and query parameters with Zod `safeParse` at the route boundary. Return an explicit client-facing error for invalid input.
- Authenticated routes use the `auth` middleware. Scope user-owned reads and writes to `owner(req)` / `userId`; do not rely on client-supplied ownership identifiers.
- Keep client feature behavior in the corresponding page and share cross-page behavior through `client/src/lib/` or reusable components. Handle API failures as errors rather than displaying fabricated success data.
- Persist durable model changes through Prisma schema updates and migrations. Preserve the existing account preference normalization and defaults when changing appearance settings.
- The TypeScript configurations are strict. Keep client and server changes type-safe and validate both sides with the root build when a change crosses the API boundary.
