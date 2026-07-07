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
- **Auth:** Username/password per role, in-memory session tokens

The API is fully decoupled from the UI, so a future mobile app (React Native /
Flutter) can call the same endpoints with no backend changes.

## Getting started

```bash
npm install
npm start
```

The server starts on `http://localhost:3000` (set `PORT` to override).

## Deploy for free (Render)

This repo includes a `render.yaml` blueprint.

1. Push this repo to GitHub (already done if you're reading this on GitHub).
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect this repo. Render reads `render.yaml` and creates a free Node web service automatically.
4. Click **Apply** — first deploy takes ~2 minutes. You'll get a public URL like `https://wheelcare.onrender.com`.

Note: Render's free tier spins the service down after 15 minutes of inactivity
(the next request wakes it up after ~30s) and has an ephemeral filesystem, so
data written to `data/db.json` resets on redeploy/restart — fine for a demo,
not for production (see "Known gaps" below).

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
utils.js              Month/currency helpers, WhatsApp & SMS reminder link builders
routes/admin.js        Super admin endpoints
routes/client.js        Client (business) endpoints
routes/customer.js      Customer endpoints
data/db.json            JSON "database"
public/index.html        App shell
public/styles.css        Design system (brand colors, cards, chips, bottom nav)
public/app.js             SPA state, rendering and event wiring
```

## API overview

- `POST /api/login` `{ role, username, password }` → `{ token, role, user }`
- `POST /api/logout`
- **Super admin:** `GET/POST /api/admin/clients`, `GET /api/admin/overview`
- **Client:** `GET /api/client/data`, `POST /api/client/customers`,
  `POST /api/client/customers/:id/vehicles`, `GET/POST/DELETE /api/client/staff`,
  `GET/POST /api/client/payments`, `GET /api/client/reminder/:vehicleId`,
  `GET /api/client/reminders`
- **Customer:** `GET /api/customer/data`

Reminders are built server-side into pre-filled `wa.me` (WhatsApp) and `sms:`
deep links — no paid SMS/WhatsApp API required.

## Known gaps / before going live

- Passwords are stored in plain text — needs bcrypt hashing
- Session tokens are in-memory and reset on server restart — needs JWT or a
  persistent session store
- JSON file database won't scale — needs a real database (SQLite to start,
  Postgres for scale)
- No real WhatsApp Business API / SMS gateway — reminders open a pre-filled
  deep link that has to be manually sent; a production version could
  integrate Twilio or the WhatsApp Business API
- No automated recurring reminder scheduling — currently manual, triggered by
  the client tapping a button

## Roadmap

1. ✅ Web app (current) — 3-role system, dues tracking, manual WhatsApp/SMS reminders
2. 🔜 Production hardening — password hashing, real database, proper auth
3. 🔜 Mobile app (React Native or Flutter) — same API, native push notifications
4. 🔜 Automated recurring reminders and online payment collection (Razorpay/UPI autopay)
