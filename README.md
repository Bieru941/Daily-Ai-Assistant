# Daymate

A production-oriented full-stack starter for an AI-powered personal productivity assistant.

## Stack
- React + TypeScript + Vite
- Tailwind CSS
- Node.js + Express
- PostgreSQL + Prisma
- JWT-based HTTP-only cookie sessions
- OpenAI-compatible backend AI endpoint
- Recharts
- Lucide React

## Client architecture

The browser client remains a React + TypeScript + Vite application. Its source is organized by responsibility:

```text
client/src/
  assets/       images and icons
  components/
    common/     reusable UI primitives and loading states
    cards/      shared card-oriented UI
    layouts/    authenticated application shell
  navigation/   route metadata and history-based navigation
  screens/      feature screens grouped by product area
  services/     API, authentication, and browser sound services
  theme/        appearance types, defaults, and normalization
  types/        shared task, profile, and preference types
  App.tsx       application entry component
  main.tsx      Vite/React DOM bootstrap
```

Screen navigation is the existing lightweight history-based navigation; route metadata and the authenticated shell are separate from screen rendering, and feature screens remain lazy-loaded. Authentication requests are isolated in `services/authService.ts`; shared browser requests use `services/api.ts`. No separate hooks or store folder is needed while cross-screen state remains limited to the app shell, so no state-management dependency was added. The `@/` import alias points to `client/src`.

## Quick start

### 1. Requirements
- Node.js 20+
- Docker with the Compose plugin, or PostgreSQL 15+

### 2. Install
```bash
npm install
npm install --prefix client
```

### 3. Environment
Copy `.env.example` to `.env` and set values.

The example file contains placeholders only. Keep `JWT_SECRET`, `DATABASE_URL`, SMTP credentials, and AI provider credentials in the server environment; only `VITE_API_URL` is a browser build-time setting.
If setting `VITE_API_URL`, copy `client/.env.example` to `client/.env`; otherwise the development `/api` proxy is used.

To enable the admin panel, set `ADMIN_EMAILS` to a comma-separated list of account email addresses, for example `ADMIN_EMAILS=admin@example.com`. Sign in using one of those accounts; the admin navigation and API are restricted to allowlisted accounts. Leave it unset to disable admin access.

To enable signup email verification and **Forgot password?**, configure `SMTP_HOST`, `SMTP_PORT` (usually `587`), and `SMTP_FROM`. Set `SMTP_USER` and `SMTP_PASS` when your mail server requires authentication. Verification and password reset codes expire after 10 minutes and allow up to five attempts. After adding these features to an existing database, apply pending migrations with `npx prisma migrate deploy`. Existing accounts remain verified.

Settings feedback is emailed to the addresses in `ADMIN_EMAILS` and, when configured, `SUPPORT_EMAIL`. Feedback requires the SMTP configuration above and at least one recipient; without it, the API returns a configuration error instead of reporting false success.

### 4. Database
For a local development database, start the included PostgreSQL container:
```bash
cp .env.example .env
```
Set `DATABASE_URL` in `.env` to `postgresql://daymate:daymate@localhost:5432/daymate?schema=public`, then run:
```bash
npm run db:up
npx prisma generate
npx prisma migrate dev
npm run seed
```
The database listens on port `5432` and persists data in the `postgres_data` Docker volume. Stop the container with `npm run db:down`; this keeps the volume and its data. To delete the local database and its data, run `docker compose down -v`.

If you already run PostgreSQL elsewhere, set `DATABASE_URL` in `.env` to that database instead of starting the container.

### 5. Run
```bash
npm run dev
```
Frontend: http://localhost:5173
API: http://localhost:4000

### 6. Build
```bash
npm run build
```
This type-checks/builds the Express server and production client. There is currently no configured test runner or lint script; run the build after changes to validate TypeScript and production bundling.

### 7. iOS and Android
The client can be packaged for native iOS and Android with Capacitor while keeping the existing React/Vite UI:
```bash
cd client
```
Create each native project only once. Skip a command if that platform's directory (`ios/` or `android/`) already exists; do not remove those directories to rerun `cap add`, since that deletes the native project.
```bash
npm run cap:add:ios
npm run cap:add:android
```
Whenever you need to copy the latest web build into the native projects, sync them and open the IDE for your platform:
```bash
npm run cap:sync
```
Open the iOS project on macOS with Xcode, or open Android with Android Studio installed:
```bash
npm run cap:open:ios
npm run cap:open:android
```
Use Xcode on macOS to build/sign iOS. Build Android with Android Studio, JDK 21, and Android SDK 36 or newer; `cap:open:android` cannot launch the IDE if Android Studio is not installed. Before a mobile build, set `VITE_API_URL` to the HTTPS URL of the deployed API; an empty URL only works with the Vite `/api` proxy and is rejected when the app runs natively. Add `capacitor://localhost` and `http://localhost` to the server's comma-separated `CLIENT_ORIGIN` for production mobile clients. Because the API uses HTTP-only cookies, set `SESSION_COOKIE_SAME_SITE=none` for cross-origin mobile API requests; this also enables `Secure` cookies, so the API must use HTTPS. Do not place server secrets or Supabase service-role keys in client environment variables.

The `@supabase/supabase-client-react-router` registry item installs optional Supabase browser and server helpers. It does not add React Router or replace the existing Express/Prisma authentication and database integration. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only if you configure Supabase; neither value is a service-role secret.

The AI key is server-side only. If it is missing, the UI reports that AI is unavailable rather than faking a response.

The AI Assistant can include up to three plain-text `.txt`, `.md`, `.csv`, or `.json` files per message (16 KB per file, 24 KB total). Attachment contents are included in the conversation and sent to the configured AI provider.

### Admin panel
Allowlisted administrators can view platform-wide record counts and search a paginated user directory. The panel is read-only; it does not expose password hashes or provide account deletion controls.

### Settings
Open **Settings** to edit your display name and password, customize AI personality/response length/language/instructions, and change appearance, dashboard, accessibility, notification, and startup preferences. Saved settings belong to the signed-in account and are restored at sign-in. Apply the new `20261023050000_expand_user_settings` migration with `npx prisma migrate deploy` before using the added AI, notification, and startup settings on an existing database.

Appearance preview remains temporary until applied or saved; **Cancel** restores the last saved appearance. Dashboard widgets use real account data. Notification history is account-scoped and includes task-completion entries and test notifications. Quiet hours suppress reminder and task-completion sounds while the app is open. Privacy settings can export account data as JSON or delete AI conversation history.

The browser app already lazy-loads feature pages. Startup selection chooses the first page after sign-in; cache clearing only removes the local appearance cache and does not affect saved cloud preferences or the session. Web browsers do not allow the app to manage operating-system startup, hardware acceleration, or HTTP cache.

### Sound alerts
Sound alerts can be enabled or disabled in **Settings → Notifications** and are saved in the current browser. A tone plays after a task is successfully completed, and due reminders are checked while the app is open. Quiet hours suppress scheduled sounds; use **Test reminder sound** to preview it. Browsers may require a page interaction before playing scheduled audio; alerts do not run when the app is closed.

### Loading states
Dashboard, task, calendar, reminder, note, goal, productivity, settings, admin, and conversation-history loading states use responsive skeleton placeholders. Their shimmer animation is disabled when the operating system requests reduced motion.
