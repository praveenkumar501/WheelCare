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
- **Auth:** Phone number + OTP, for every role including the super admin. There
  is no password anywhere in the system (see "Auth model" below).

The API is fully decoupled from the UI, so a future mobile app (React Native /
Flutter) can call the same endpoints with no backend changes.

## Getting started

```bash
npm install
npm start
```

The server starts on `http://localhost:3000` (set `PORT` to override).

## Demo credentials

Log in with the phone number below on the matching role tab, tap **Send OTP**,
then tap WhatsApp or SMS to read the code (no account or gateway needed — the
code is right there in the pre-filled message) and enter it.

| Role        | Phone        |
|-------------|--------------|
| Super Admin | `9999999999` |
| Client      | `9876543210` |
| Customer    | `9812345671` |

The seed data (`data/db.json`) includes two demo client businesses, five
customers, six vehicles, three staff members, and payment history across
three months — with a realistic mix of paid/due vehicles for the current month.

## Project layout

```
server.js            Express app, session + OTP auth, static serving
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

Every role — super admin, client (business owner), and customer — logs in the
same way: enter your phone number, request an OTP, and verify it. There is no
password anywhere in the system, so there's nothing to hash, forget, reset, or
leak. The OTP itself follows the same tap-to-send pattern as reminders: the
server generates a 6-digit code and hands back a pre-filled `wa.me`/`sms:`
link containing it — tapping the link reveals the code (no need to even press
send), which is then typed back in to verify. Codes expire after 5 minutes and
are single-use. This works today with zero external accounts; wiring up a real
SMS/WhatsApp Business API gateway later would let the code be delivered
automatically instead.

## API overview

- `POST /api/otp/request` `{ role, phone }` → `{ waLink, smsLink }`
- `POST /api/otp/verify` `{ role, phone, otp }` → `{ token, role, user }`
- `POST /api/logout`
- `POST /api/client-requests` — public business signup request
- **Super admin:** `GET/POST /api/admin/clients`, `POST /api/admin/clients/:id/active`,
  `GET /api/admin/client-requests`, `POST /api/admin/client-requests/:id/approve|reject`,
  `GET /api/admin/overview`
- **Client:** `GET /api/client/data`, `POST/PUT/DELETE /api/client/customers`,
  vehicle and staff CRUD, `GET/POST /api/client/payments`,
  `GET /api/client/reminder/:vehicleId`, `GET /api/client/reminders`
- **Customer:** `GET /api/customer/data`

Reminders, welcome messages, and payment receipts are built server-side into
pre-filled `wa.me` (WhatsApp) and `sms:` deep links, including a real login
link back to the app (derived from the actual request host, so it works on
localhost today and automatically on your real domain once deployed) — no
paid SMS/WhatsApp API required for any of this.

## Known gaps / before going live

- Session tokens and OTP codes are in-memory and reset on server restart —
  needs a persistent session/OTP store
- JSON file database won't scale — needs a real database (SQLite to start,
  Postgres for scale)
- No real WhatsApp Business API / SMS gateway — OTPs and messages open a
  pre-filled deep link that has to be manually tapped to view/send; a
  production version could integrate Twilio or the WhatsApp Business API for
  automatic, out-of-band OTP delivery
- No automated recurring reminder scheduling — currently manual, triggered by
  the client tapping a button

## Roadmap

1. ✅ Web app (current) — 3-role system, arrears-aware dues tracking,
   password-free OTP login for every role, business registration + approval
   flow, manual WhatsApp/SMS reminders and receipts
2. 🔜 Production hardening — persistent sessions/OTP store, real database
3. 🔜 Mobile app (React Native or Flutter) — same API, native push notifications
4. 🔜 Real SMS/WhatsApp gateway for automatic OTP delivery, plus online
   payment collection (Razorpay/UPI autopay)

---

Developed by Praveen Kumar Athyala
