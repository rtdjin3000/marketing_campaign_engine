# Restaurant Outreach Campaign Tool

Full-stack Next.js application for discovering nearby commercial leads, manually validating public business contacts, and launching compliant email or WhatsApp campaigns for a restaurant.

## Stack

- Next.js App Router with TypeScript and Tailwind CSS
- Prisma ORM with SQLite for local development
- Google Geocoding and Places APIs for location discovery
- OpenAI subject-line generation for campaign copy assistance
- SMTP-ready email delivery with SendGrid or Mailgun placeholders
- Meta WhatsApp Business Cloud API integration hooks

## Compliance Guardrails

- No Google Maps scraping. Business discovery uses approved APIs only.
- Website enrichment scans only public pages and keeps only generic business emails.
- Campaign sends are blocked unless leads are manually approved.
- Email messages include unsubscribe handling.
- WhatsApp sends require opt-in or an existing business relationship flag.
- Rate limiting, message logs, recipient status tracking, and dry-run mode are built in.

## Setup

1. Copy `.env.example` to `.env` and add your credentials.
2. Install dependencies with `npm install`.
3. Create the local database with `npm run db:push`.
4. Generate Prisma client with `npm run prisma:generate`.
5. Seed sample data with `npm run seed`.
6. Start the app with `npm run dev`.

## Core Routes

- `POST /api/geocode`
- `POST /api/search-businesses`
- `POST /api/enrich-contact`
- `GET /api/leads`
- `PATCH /api/leads/:id`
- `POST /api/campaigns`
- `GET /api/campaigns`
- `POST /api/campaigns/:id/preview`
- `POST /api/campaigns/:id/send-email`
- `POST /api/campaigns/:id/send-whatsapp`
- `POST /api/opt-out`

## Local Development Notes

- If `GOOGLE_MAPS_API_KEY` is not set, the app uses mock discovery data so the workflow can still be tested locally.
- If `OPENAI_API_KEY` is set, the campaign builder can generate subject line ideas using the configured `OPENAI_MODEL`.
- SMTP is the default email transport. SendGrid or Mailgun can be wired in behind the same send service.
- WhatsApp sends use Meta Cloud API only and will skip recipients without explicit opt-in eligibility.

## Sample Indian Restaurant Campaign Ideas

- Special Lunch Catering Offer Near Your Office
- Fresh Indian Food Deals for Your Team This Week
- Office Lunch Made Easy Near You
- Catering Special for Local Businesses
- Treat Your Team to Fresh Indian Food
