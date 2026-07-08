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
- **Auth:** Username + password for every role. Usernames are generated
  automatically (never chosen manually) and new accounts get a WhatsApp/SMS
  link to set their own password — see "Auth model" below.

The API is fully decoupled from the UI, so a future mobile app (React Native /
Flutter) can call the same endpoints with no backend changes.

## Getting started

```bash
npm install
npm start
```

The server starts on `http://localhost:3000` (set `PORT` to override).

## Demo credentials

Log in with the username and password below on the matching role tab.

| Role        | Username  | Password      |
|-------------|-----------|----------------|
| Super Admin | `admin`   | `password123` |
| Client      | `praveen` | `password123` |
| Customer    | `anita`   | `password123` |

The seed data (`data/db.json`) includes two demo client businesses, five
customers, six vehicles, three staff members, and payment history across
three months — with a realistic mix of paid/due vehicles for the current month.

## Project layout

```
server.js            Express app, session + password auth, static serving
db.js                 JSON file read/write helpers
utils.js              Date/money helpers, message + link builders
routes/admin.js        Super admin endpoints
routes/client.js        Client (business) endpoints
routes/customer.js      Customer endpoints
routes/public.js         Unauthenticated endpoints (business registration requests)
data/db.json            JSON "database"
public/index.html        App shell
public/styles.css        Design system (brand colors, cards, chips, glassmorphism)
public/app.js             SPA state, rendering, hash-based routing, event wiring
```

## Auth model

Every role logs in with a username and a bcrypt-hashed password — but nobody
ever types their own username or picks their own password at signup time:

- **Usernames are generated server-side** from the person's name (e.g. "Anita
  Sharma" → `anita`, with a numeric suffix on collision) whenever a business
  or customer account is created — by the super admin, by a client onboarding
  a customer, or via the public business-registration request once approved.
- **New accounts get a "set your password" link**, delivered the same
  tap-to-send way as reminders: a pre-filled `wa.me`/`sms:` message containing
  a one-time link to `#/set-password`. The account has `password: null` until
  that link is used, so nobody (including the super admin) ever sees or sets
  anyone else's password.
- **Forgot password** is self-service: verify with username + phone, then set
  a new password directly (`POST /api/forgot-password`).
- **Resend the setup link** anytime from the Edit Customer / Edit Business
  modal if the original message was missed or a reset is needed.

## API overview

- `POST /api/login` `{ role, username, password }` → `{ token, role, user }`
- `POST /api/logout`
- `POST /api/forgot-password` `{ role, username, phone, newPassword }`
- `POST /api/set-password` `{ role, token, password }`
- `POST /api/client-requests` — public business signup request
- **Super admin:** `GET/POST /api/admin/clients`, `PUT /api/admin/clients/:id`,
  `POST /api/admin/clients/:id/active`, `POST /api/admin/clients/:id/resend-setup`,
  `GET /api/admin/client-requests`, `POST /api/admin/client-requests/:id/approve|reject`,
  `GET /api/admin/overview`
- **Client:** `GET /api/client/data`, `POST/PUT/DELETE /api/client/customers`,
  `POST /api/client/customers/:id/resend-setup`, vehicle and staff CRUD,
  `GET/POST /api/client/payments`, `GET /api/client/reminder/:vehicleId`,
  `GET /api/client/reminders`
- **Customer:** `GET /api/customer/data`

Reminders, welcome messages, password setup links, and payment receipts are
all built server-side into pre-filled `wa.me` (WhatsApp) and `sms:` deep
links — no paid SMS/WhatsApp API required for any of this.

## Known gaps / before going live

- Session tokens are in-memory and reset on server restart — needs a
  persistent session store
- JSON file database won't scale — needs a real database (SQLite to start,
  Postgres for scale)
- No real WhatsApp Business API / SMS gateway — password setup links,
  reminders and receipts open a pre-filled deep link that has to be manually
  tapped to send; a production version could integrate Twilio or the
  WhatsApp Business API for automatic, out-of-band delivery
- No automated recurring reminder scheduling — currently manual, triggered by
  the client tapping a button

## Roadmap

1. ✅ Web app (current) — 3-role system, arrears-aware dues tracking,
   auto-generated usernames with WhatsApp/SMS password-setup links,
   business registration + approval flow, manual WhatsApp/SMS reminders and
   receipts
2. 🔜 Production hardening — persistent sessions, real database
3. 🔜 Mobile app (React Native or Flutter) — same API, native push notifications
4. 🔜 Real SMS/WhatsApp gateway for automatic message delivery, plus online
   payment collection (Razorpay/UPI autopay)

---

Developed by Praveen Kumar Athyala
