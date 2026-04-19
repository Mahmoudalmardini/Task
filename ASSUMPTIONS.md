# Assumptions

This document captures explicit assumptions made while implementing the Delivery Operations Backend. Where a requirement was ambiguous, the reasoning behind each choice is spelled out so reviewers can evaluate the judgment, not just the code.

---

## 1. Order status is a strict finite-state machine

```
CREATED ──► ASSIGNED ──► PICKED_UP ──► DELIVERED  (terminal)
  │           │             │
  │           ▼             ▼
  └────────► CANCELLED ◄────┘              (terminal)

ASSIGNED ──► CREATED         (only via explicit unassign endpoint)
```

- Reassignment after `DELIVERED` or `CANCELLED` is **not permitted**.
- Transitions are enforced both by the FSM util (`src/common/utils/status-fsm.ts`) and by **atomic `findOneAndUpdate` guards** at the repository layer — preventing race conditions without requiring Mongo transactions.

## 2. Captain deactivation with in-flight orders is allowed and audited

The task says deactivation must be "supported cleanly". We allow a captain to be deactivated even if they currently hold ASSIGNED or PICKED_UP orders. Rationale:

- Refusing the operation leaves admins stuck when a captain quits mid-shift.
- Every activate/deactivate is written to the `audit_logs` collection with the admin's `sub`, so the decision is traceable.

If you prefer the stricter rule (reject deactivation while holding orders), the change is ~5 lines in `CaptainsService.deactivate()`.

## 3. Inactive captains are blocked at both layers

- REST: `OrdersService.assign()` calls `CaptainsService.isActive()` before attempting the atomic update; mismatches return **409**.
- WebSocket: `CaptainRepository.updateLocation()` atomically requires `status: ACTIVE` in the update filter. An INACTIVE captain's update is rejected and logged at `warn`.

## 4. Location storage: latest + history

- `captains.currentLocation` holds the most recent `{ lat, lng, updatedAt }`.
- Every accepted update is **also** appended to `location_history` — useful for audit, replay, and future analytics. If size becomes a concern, add a TTL index on `recordedAt`.

## 5. Phone numbers are E.164

Format: `^\+[1-9]\d{6,14}$` (e.g. `+962791234567`). Chosen for unambiguous international representation. Validated by `class-validator` on every inbound DTO.

## 6. Lat/lng validation

- `lat` ∈ [-90, 90], `lng` ∈ [-180, 180] — enforced via `@IsLatitude`/`@IsLongitude` and Mongoose schema `min`/`max`.

## 7. Partner API keys

- Stored as **bcrypt hashes**; the raw key is printed once, only by the seed script.
- Lookup uses a short **prefix** (first 8 chars) to avoid a full-collection bcrypt scan. The prefix is non-secret.
- Deactivation: set `active: false` on the `api_keys` document — `ApiKeyGuard` filters on `{ prefix, active: true }`.

## 8. Idempotency behaviour

- Scope: per `(apiKeyId, idempotency-key)` pair.
- TTL: `IDEMPOTENCY_TTL_HOURS` (default 24) enforced via Mongo TTL index on `expiresAt`.
- Collision: same key + **same body hash** → replay cached response (with `Idempotency-Replayed: true` header). Same key + **different body hash** → `409`.
- Failure-mode choice: if storing the record fails after a successful handler run, we log at `warn` but **do not** reverse the business action. The alternative (rolling back the order) was judged worse than the small risk of a missed idempotency cache.

## 9. Rate limiting

- 60 requests / 60 seconds per API key (configurable). Resolved key is used as the throttler tracker, not IP — because partners may share infrastructure.
- In-memory store. For multi-instance production, swap in `@nestjs/throttler-storage-redis`.

## 10. `externalReference` is a unique sparse index on orders

- Partners can omit the field (most do). Present values must be globally unique; duplicates are rejected with `409`.
- This doubles as a cheap second layer of idempotency — even without an `Idempotency-Key`, a partner who re-sends the same `externalReference` gets a clear failure.

## 11. Order reassignment

We considered three options and documented the chosen behaviour:

| Option | Chosen? | Reasoning |
|---|---|---|
| Allow reassignment at any time | No | Violates the FSM intent and confuses status transitions |
| Allow reassignment only when ASSIGNED | **Yes** (via unassign → assign) | Clean, composable, keeps the FSM minimal |
| Allow reassignment after DELIVERED/CANCELLED | No | Terminal by definition |

`PATCH /orders/:id/status` uses the FSM directly; `POST /orders/:id/assign` is restricted to `CREATED + unassigned`.

## 12. Authorization roles

- `admin` → all REST endpoints under `/captains`, `/orders`, `/reports` via `JwtAuthGuard + RolesGuard`
- `partner` → `/partner/*` via `ApiKeyGuard` (no JWT)
- `captain` → WebSocket handshake on `/locations` only (cannot call REST admin APIs)

## 13. No multi-document transactions

- Target is a single-node Mongo deployment (see `docker-compose.yml`).
- All state changes use **single-document atomic operations** (`findOneAndUpdate` with guard filters). This is race-safe and works on standalone Mongo.
- Cross-collection writes (order update + audit log record) are **not** transactional. The audit log is best-effort and logs an error on failure; the primary action still succeeds.

## 14. AI tool disclosure

Claude Code (Opus 4.7) was used to:

- Scaffold the NestJS project structure, `package.json`, `tsconfig`, and Docker files.
- Draft boilerplate code (DTOs, schemas, repository stubs, Swagger decorators).
- Produce this document, `TRADEOFFS.md`, the README, and the socket protocol doc.

All business logic (FSM, atomic operations, aggregation pipeline, idempotency flow, rate limit tracker, race-condition handling) was reviewed and finalized by the candidate. Tests were authored by the candidate to verify the reviewed logic. No AI-generated code was committed without being read line-by-line.
