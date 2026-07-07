# WheelCare — Vehicle Maintenance Subscription App

A web app for a vehicle cleaning & maintenance business run out of a residential
community. The business owner cleans bikes and cars for residents on a
**monthly subscription** basis instead of charging per wash. WheelCare manages
that subscription business end-to-end, and is built so multiple such businesses
can run on the same platform.

## Roles

- **Super Admin** — onboards client businesses, sees platform-wide stats and revenue.
- **Client** (business owner) — manages customers, vehicles, staff and payments;
  sends WhatsApp/SMS payment reminders with one tap.
- **Customer** (vehicle owner) — sees dues, payment history, and can message the
  provider on WhatsApp.

## Tech stack

- **Backend:** Node.js + Express, REST API, JSON file database (`data/db.json`)
- **Frontend:** Single-page vanilla JS app (`public/`) — no framework, calls the
  REST API with `fetch` and a Bearer token
- **Auth:** Username/password per role (bcrypt-hashed), in-memory session tokens.
  Customers never have a password chosen for them — they set their own via a
  one-time WhatsApp/SMS link (see "Password model" below).

The API is fully decoupled from the UI, so a future mobile app (React Native /
Flutter) can call the same endpoints with no backend changes.

## Getting started

```bash
npm install
npm start
```

The server starts on `http://localhost:3000` (set `PORT` to override).

## Demo credentials

| Role        | Username  | Password    |
|-------------|-----------|-------------|
| Super Admin | `admin`   | `admin123`  |
| Client      | `praveen` | `praveen123`|
| Customer    | `anita`   | `anita123`  |

The seed data (`data/db.json`) includes two demo client businesses, five
customers, six vehicles, three staff members, and payment history across
three months — with a realistic mix of paid/due vehicles for the current month.

## Project layout

```
server.js            Express app, session auth middleware, static serving
db.js                 JSON file read/write helpers
utils.js              Date/money helpers, password hashing, message + link builders
routes/admin.js        Super admin endpoints
routes/client.js        Client (business) endpoints
routes/customer.js      Customer endpoints
routes/public.js         Unauthenticated endpoints (registration requests, forgot
                          password, customer password setup)
data/db.json            JSON "database"
public/index.html        App shell
public/styles.css        Design system (brand colors, cards, chips, glassmorphism)
public/app.js             SPA state, rendering, hash-based routing, event wiring
```

## Password model

- **Super admin / client (business owner):** password set directly at account
  creation (by the platform admin or self-chosen via business registration),
  bcrypt-hashed at rest, comparable but never readable — not even by the
  platform operator.
- **Customer:** never has a password chosen for them. Adding a customer
  generates a one-time setup token; the WhatsApp/SMS welcome message links to
  `/#/set-password?token=...` where they choose their own password. A business
  owner can trigger a fresh link anytime via "Send Password Setup Link" on the
  Edit Customer screen — there is no way for a business owner (or the platform
  admin) to see or set a customer's actual password.
- **Forgot password** (all roles): self-service, verified by username + the
  phone number on file, since there's no email/SMS OTP gateway configured yet.

## API overview

- `POST /api/login` `{ role, username, password }` → `{ token, role, user }`
- `POST /api/logout`
- `POST /api/client-requests` — public business signup request
- `POST /api/forgot-password`, `POST /api/set-password` — public, self-service
- **Super admin:** `GET/POST /api/admin/clients`, `POST /api/admin/clients/:id/active`,
  `GET /api/admin/client-requests`, `POST /api/admin/client-requests/:id/approve|reject`,
  `GET /api/admin/overview`
- **Client:** `GET /api/client/data`, `POST/PUT/DELETE /api/client/customers`,
  `POST /api/client/customers/:id/reset-password`, vehicle and staff CRUD,
  `GET/POST /api/client/payments`, `GET /api/client/reminder/:vehicleId`,
  `GET /api/client/reminders`
- **Customer:** `GET /api/customer/data`

Reminders, welcome messages, and payment receipts are built server-side into
pre-filled `wa.me` (WhatsApp) and `sms:` deep links, including a real login
link back to the app (derived from the actual request host, so it works on
localhost today and automatically on your real domain once deployed) — no
paid SMS/WhatsApp API required for any of this.

## Known gaps / before going live

- Session tokens are in-memory and reset on server restart — needs JWT or a
  persistent session store
- JSON file database won't scale — needs a real database (SQLite to start,
  Postgres for scale)
- No real WhatsApp Business API / SMS gateway — messages open a pre-filled
  deep link that has to be manually tapped to send; a production version
  could integrate Twilio or the WhatsApp Business API for automatic delivery
  and real OTP-based login
- No automated recurring reminder scheduling — currently manual, triggered by
  the client tapping a button

## Roadmap

1. ✅ Web app (current) — 3-role system, arrears-aware dues tracking, hashed
   passwords, self-service customer password setup, business registration +
   approval flow, manual WhatsApp/SMS reminders and receipts
2. 🔜 Production hardening — persistent sessions, real database
3. 🔜 Mobile app (React Native or Flutter) — same API, native push notifications
4. 🔜 Real SMS/WhatsApp gateway for automatic delivery and OTP login, plus
   online payment collection (Razorpay/UPI autopay)

---

Developed by Praveen Kumar Athyala
