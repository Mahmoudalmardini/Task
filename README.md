# Delivery Operations Backend

Production-minded backend for a small delivery operation. Admins manage captains and orders, captains stream live location updates over WebSockets, and external partners create orders via a rate-limited, idempotent REST API.

Stack: **NestJS 10 + TypeScript + MongoDB (Mongoose) + Socket.IO + Swagger**

---

## Contents

- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Seeded demo data](#seeded-demo-data)
- [Running](#running)
- [API overview](#api-overview)
- [Auth](#auth)
- [Socket.IO — live captain location](#socketio--live-captain-location)
- [Partner API](#partner-api)
- [Reports](#reports)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Further reading](#further-reading)

---

## Quick start

### Option A — Docker (recommended)

```bash
cp .env.example .env
docker compose up --build
```

This starts MongoDB, the NestJS app, and runs the seed script once. The app is available at:

- **API**: http://localhost:3000
- **Swagger UI**: http://localhost:3000/api
- **OpenAPI JSON**: http://localhost:3000/api-json

The raw partner API key is **printed in the `seed` container logs** — grab it from `docker compose logs seed`.

### Option B — Local

```bash
cp .env.example .env                  # edit JWT_SECRET & MONGO_URI as needed
npm install
npm run seed                          # clears DB and loads demo data
npm run start:dev                     # http://localhost:3000/api
```

---

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `NODE_ENV` | Environment | `development` |
| `PORT` | HTTP port | `3000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/delivery_ops` |
| `JWT_SECRET` | JWT signing secret (≥16 chars) | — (required) |
| `JWT_EXPIRES_IN` | JWT TTL | `24h` |
| `SEED_ADMIN_EMAIL` | Admin seeded on `npm run seed` | `admin@example.com` |
| `SEED_ADMIN_PASSWORD` | Admin password | `Admin@123` |
| `PARTNER_RATE_LIMIT_TTL_SECONDS` | Throttler window | `60` |
| `PARTNER_RATE_LIMIT_MAX` | Requests per window per API key | `60` |
| `IDEMPOTENCY_TTL_HOURS` | Idempotency record TTL | `24` |

Validated at startup via Joi (`src/config/validation.schema.ts`). Missing values fail fast.

---

## Seeded demo data

Running `npm run seed` (or the `seed` Docker service) loads:

- **1 admin** (credentials from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`)
- **1 partner API key** — **raw key printed to stdout**, bcrypt hash stored in `api_keys`
- **6 captains** — 4 active (2 online, 2 offline), 2 inactive
- **~42 orders** with a deliberate distribution to demo the report endpoint:
  - Captain 1: 12 previous → 3 current (75% drop)
  - Captain 2:  8 previous → 6 current (25% drop)
  - Captain 3:  4 previous → 4 current (no drop, filtered out)
  - Plus 5 live orders across CREATED / ASSIGNED / PICKED_UP / CANCELLED for list demos

---

## Running

| Command | Purpose |
|---|---|
| `npm run start:dev` | Dev server with watch mode |
| `npm run start:prod` | Runs compiled `dist/main.js` |
| `npm run build` | Compile TypeScript |
| `npm run lint` | ESLint + Prettier |
| `npm run seed` | Re-seed the database (drops existing data) |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests (in-memory MongoDB) |

---

## API overview

| Area | Method & Path | Auth |
|---|---|---|
| Auth | `POST /auth/login` | — |
| Captains | `POST /captains`, `GET /captains`, `GET /captains/:id`, `PATCH /captains/:id`, `DELETE /captains/:id` | Admin JWT |
| Captains | `POST /captains/:id/activate`, `POST /captains/:id/deactivate` | Admin JWT |
| Orders | `POST /orders`, `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id`, `DELETE /orders/:id` | Admin JWT |
| Orders | `POST /orders/:id/assign`, `POST /orders/:id/unassign`, `PATCH /orders/:id/status` | Admin JWT |
| Partner | `POST /partner/orders` | `X-API-Key` |
| Reports | `GET /reports/captains/order-volume-drop` | Admin JWT |

**Advanced orders list** (`GET /orders`) supports:

- Filters: `status`, `region`, `captainId`, `from`, `to`, `assignmentState` (`assigned`/`unassigned`)
- Text search: `q` (Mongo text index on `orderNumber`, `customerName`, `customerPhone`)
- Sorting: `sortBy` ∈ {`createdAt`,`updatedAt`,`status`}; `sortOrder` ∈ {`asc`,`desc`}
- Pagination: `page` (≥1), `limit` (1–100, default 20). Response includes `{ data, meta: { page, limit, total, totalPages } }`

Full request/response details are in **Swagger UI** (`/api`).

---

## Auth

- **Admin** authenticates via `POST /auth/login` → receives a JWT. Send as `Authorization: Bearer <token>`.
- **Partner** authenticates via `X-API-Key` header. Keys are stored as bcrypt hashes.
- **Captain** authenticates via JWT on the WebSocket handshake. (The captain JWT is issued internally — the seed script prints one for demo, or you can create one via the `AuthService.issueCaptainToken()` helper.)

**Seeded admin credentials** are whatever you set in `.env` (`admin@example.com` / `Admin@123` by default).

---

## Socket.IO — live captain location

**Namespace**: `/locations`

**Handshake auth**: provide JWT as `auth.token` or `Authorization: Bearer <token>` header.

**Events**

| Direction | Event | Payload | Notes |
|---|---|---|---|
| client → server | `captain:location:update` | `{ lat, lng }` | Rejected if captain is INACTIVE |
| client → server | `admin:subscribe:order` | `{ orderId }` | Admin joins `order:<id>` room |
| server → client | `captain:location:updated` | `{ captainId, lat, lng, recordedAt }` | Broadcast to `admins` room and `order:<id>` rooms of captain's active orders |

Each update also appends a row to the `location_history` collection. Full protocol & sample client in [`docs/socket-protocol.md`](docs/socket-protocol.md).

---

## Partner API

- **Auth**: `X-API-Key` header
- **Rate limit**: 60 req / 60s per API key (configurable). `429` on excess.
- **Idempotency**: send `Idempotency-Key: <uuid>`. Same key + same body within 24h replays the cached response (header `Idempotency-Replayed: true`). Same key + different body → `409 Conflict`.
- **External reference**: the optional `externalReference` field is indexed uniquely — duplicates rejected with `409`.

Example request:

```bash
curl -X POST http://localhost:3000/partner/orders \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: <paste key from seed logs>' \
  -H 'Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000' \
  -d '{
    "customerName": "Sara Ahmad",
    "customerPhone": "+962799999999",
    "region": "Amman - Sweifieh",
    "fullAddress": "Al-Wakalat Street, Amman",
    "location": { "lat": 31.95, "lng": 35.85 },
    "externalReference": "PARTNER-REF-001"
  }'
```

---

## Reports

`GET /reports/captains/order-volume-drop` — compares two non-overlapping time windows and returns captains whose assigned-order volume dropped.

Required query params: `previousFrom`, `previousTo`, `currentFrom`, `currentTo`.
Optional: `minPreviousOrders` (default 1), `minDropPercentage` (default 0), `sortBy` ∈ {`dropPercentage`,`dropCount`,`previousOrders`,`currentOrders`}, `sortOrder`, `page`, `limit`.

Implemented as a single MongoDB aggregation pipeline (`$facet` + `$group` + `$lookup`), efficient for large collections.

**Seeded demo windows** (seed uses relative dates from the day it runs):
- Previous window: 60–31 days before seed date
- Current window: 30 days before seed date → seed date

Example query (replace dates to match your seed day):
```
GET /reports/captains/order-volume-drop
  ?previousFrom=<60-days-ago>T00:00:00Z
  &previousTo=<31-days-ago>T23:59:59Z
  &currentFrom=<30-days-ago>T00:00:00Z
  &currentTo=<today>T23:59:59Z
  &minPreviousOrders=1&minDropPercentage=0
```

---

## Testing

- **Unit** (`npm test`): covers the order status FSM and the `OrdersService` assignment + transition rules.
- **E2E** (`npm run test:e2e`): boots the full app against an in-memory MongoDB (`mongodb-memory-server`), seeds orders, then exercises the full `GET /orders` filter/search/sort/paginate contract via `supertest`.

---

## Project structure

```
src/
├── main.ts                    # Nest bootstrap + Swagger setup
├── app.module.ts              # Root module
├── common/                    # Shared code (guards, filters, DTOs, FSM, enums)
├── config/                    # Environment config + Joi validation
├── modules/
│   ├── auth/                  # JWT login, passport strategy
│   ├── audit-log/             # Cross-cutting audit records
│   ├── captains/              # Captain CRUD + activation
│   ├── orders/                # Order CRUD, atomic assignment, advanced list
│   ├── locations/             # Socket.IO gateway + history collection
│   ├── partner/               # X-API-Key, rate limit, idempotency, create endpoint
│   └── reports/               # Aggregation report
└── seed/
    └── seed.ts                # Demo data loader (idempotent — clears collections first)
```

---

## Further reading

- [`ASSUMPTIONS.md`](ASSUMPTIONS.md) — documented assumptions, FSM, edge cases, AI tool disclosure
- [`TRADEOFFS.md`](TRADEOFFS.md) — design trade-offs we chose and why
- [`docs/socket-protocol.md`](docs/socket-protocol.md) — detailed WebSocket protocol
- [`docs/postman_collection.json`](docs/postman_collection.json) — import into Postman/Bruno
- Swagger UI at `/api` — live, type-accurate request/response reference
