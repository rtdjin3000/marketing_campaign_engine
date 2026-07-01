# Restaurant Outreach Campaign Tool

A full-stack Next.js app for restaurants to discover local B2B leads, import existing customers from Clover, and run **opt-in, compliance-aware** email / SMS / WhatsApp campaigns. Every send is preview-able, dry-run-able, opt-out-aware, and logged.

## Features

- **Lead discovery** via Google Geocoding + Places (falls back to mock data when no API key is set).
- **Contact enrichment** that scans only public pages and keeps generic business inboxes.
- **Manual lead validation** workflow (`PENDING_REVIEW` → `APPROVED` / `REJECTED` / `CONTACTED`).
- **Clover customer import** to sync existing customers and their marketing opt-in.
- **Campaign builder** with optional OpenAI subject-line / copy generation and poster upload.
- **Multi-channel sending**: Email (SMTP / SendGrid / Mailgun), SMS + MMS (Telnyx or Twilio), WhatsApp (Meta Cloud API).
- **Compliance built in**: opt-in gating, unsubscribe links, STOP handling, opt-out table, dry-run mode, rate limiting, and full message logs.

## Tech stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS
- Prisma ORM + SQLite (local)
- Zod validation, Nodemailer, Upstash rate limiting

## Prerequisites

- Node.js 20.6+ (the scripts use `node --env-file`)
- npm

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (PowerShell: Copy-Item .env.example .env)
cp .env.example .env          # then fill in credentials

# 3. Generate the Prisma client
npm run prisma:generate

# 4. Create the local SQLite database
npm run db:push

# 5. Seed sample data (optional)
npm run seed

# 6. Run the dev server -> http://localhost:3000
npm run dev
```

> **Database location:** the SQLite URL `file:./prisma/dev.db` is resolved relative to `prisma/schema.prisma`, so the database file is actually created at `prisma/prisma/dev.db`. That path (and `.env`) is git-ignored because it holds real customer data.

## Environment variables

All configuration lives in `.env` (see `.env.example`). Nothing is required to boot — missing keys degrade gracefully (mock discovery data, dry-run-only sends).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite connection string (default `file:./prisma/dev.db`). |
| `GOOGLE_MAPS_API_KEY` | Geocoding + Places discovery. Omit to use mock data. |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Optional AI subject-line / copy generation. |
| `EMAIL_PROVIDER` | `smtp` (default), `sendgrid`, or `mailgun`. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | SMTP email delivery. |
| `SENDGRID_API_KEY` / `MAILGUN_API_KEY` | Alternate email providers. |
| `SMS_PROVIDER` | `telnyx` (default) or `twilio`. |
| `TELNYX_API_KEY` / `TELNYX_FROM_NUMBER` / `TELNYX_MESSAGING_PROFILE_ID` | Telnyx SMS/MMS. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Twilio SMS. |
| `META_WHATSAPP_ACCESS_TOKEN` / `META_WHATSAPP_PHONE_NUMBER_ID` / `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Cloud API. |
| `META_WHATSAPP_TEMPLATE_NAME` / `META_WHATSAPP_TEMPLATE_LANGUAGE` | Approved template for business-initiated WhatsApp. |
| `APP_BASE_URL` | Base URL used in unsubscribe links. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Optional distributed rate limiting. |
| `CLOVER_MERCHANT_ID` / `CLOVER_API_TOKEN` / `CLOVER_API_BASE_URL` | Clover customer import. |

> ⚠️ **Never commit `.env` or the SQLite database** — they contain live credentials and real customer PII. Both are git-ignored; run `git ls-files` to confirm before pushing.

## npm scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack). |
| `npm run build` / `npm start` | Production build / serve. |
| `npm run lint` | ESLint (zero warnings allowed). |
| `npm run typecheck` | TypeScript type check. |
| `npm run prisma:generate` | Generate the Prisma client. |
| `npm run db:push` | Push the schema to SQLite. |
| `npm run prisma:migrate` | Create/apply a dev migration. |
| `npm run seed` | Seed sample data. |
| `npm run whatsapp:create-template` | Register a Meta WhatsApp message template. |

## Workflow

1. **Discover** — search a location + category to pull nearby businesses (`/api/search-businesses`).
2. **Enrich** — scan public pages for a generic business contact (`/api/enrich-contact`).
3. **Validate** — approve or reject leads from the dashboard (`/api/leads/:id`).
4. **Import customers** — optionally sync existing Clover customers (`/api/clover/import-customers`); their `marketingAllowed` flag becomes the opt-in.
5. **Build a campaign** — subject/body, WhatsApp/SMS text, optional poster and offer (`/api/campaigns`).
6. **Preview** — check recipients + the compliance checklist (`/api/campaigns/:id/preview`).
7. **Test** — send a single message to yourself (`send-test-email` / `send-test-sms` / `send-test-whatsapp`).
8. **Send** — dry-run first, then live (`send-email` / `send-sms` / `send-whatsapp`).

The UI exposes this via three pages: the dashboard (`/`), campaigns (`/campaigns`), and logs (`/logs`).

## Sending & compliance

- **Opt-in gating** — SMS/WhatsApp go only to phone contacts with `whatsappEligible && hasOptIn` that are not opted out. Email goes to public business inboxes or opted-in customers.
- **Dry-run mode** — every send endpoint accepts `{ "dryRun": true }` to simulate without dispatching.
- **Unsubscribe / STOP** — bulk emails append a per-recipient unsubscribe link; include "Reply STOP to opt out" in SMS copy. Opt-outs are recorded via `/api/opt-out` and excluded from future sends.
- **Message logs** — every attempt (dry-run, sent, failed, delivered, unsubscribed) is stored in the `MessageLog` table.

## API routes

**Discovery & leads**
- `POST /api/geocode`, `POST /api/location-autocomplete`
- `POST /api/search-businesses`
- `POST /api/enrich-contact`
- `GET /api/leads`, `PATCH /api/leads/:id`
- `POST /api/clover/import-customers`

**Campaigns**
- `GET /api/campaigns`, `POST /api/campaigns`
- `POST /api/campaigns/generate-subjects`, `POST /api/campaigns/generate-copy`
- `POST /api/campaigns/:id/preview`, `POST /api/campaigns/:id/poster`
- `POST /api/campaigns/:id/send-email`, `.../send-sms`, `.../send-whatsapp`
- `POST /api/campaigns/:id/send-test-email`, `.../send-test-sms`, `.../send-test-whatsapp`

**Compliance**
- `POST /api/opt-out`, `GET /api/opt-out` (unsubscribe link)

## Operational scripts

Run with the environment loaded, e.g. `node --env-file=.env scripts/<name>.js`:

| Script | Description |
| --- | --- |
| `audience-report.js` | Count reachable / opted-in audience by channel and source. |
| `contact-inventory.js` | Scraped vs. reached contacts, split by source. |
| `sms-targets.js` | List phone numbers eligible for SMS (opt-in, not opted out). |
| `status-count.js` | Lead counts by validation status. |
| `send-mms-optedin.js` | Send a campaign MMS to opted-in phones only. |
| `revert-contacted.js` | Reset `CONTACTED` leads back to `APPROVED`. |
| `create-whatsapp-template.js` | Create a Meta WhatsApp message template. |

## Project structure

```
prisma/            Prisma schema, migrations, seed
scripts/           Operational / reporting scripts
src/app/           App Router pages and API routes
src/components/    Dashboard, campaigns, logs UI
src/lib/           Services, Prisma client, Clover, utils, env, rate limiting
```

## License

MIT — see [LICENSE](LICENSE).
