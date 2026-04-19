# Trade-offs

Short, honest notes on the choices behind this implementation. Where a shortcut was taken, it's called out.

---

## 1. NestJS over Express

**Chosen**: NestJS.

- **Pro**: Built-in DI, guards, pipes, interceptors, Swagger integration, WebSocket adapter — all things we'd otherwise bolt on manually and get slightly wrong.
- **Con**: Heavier than Express; more indirection to learn.
- **Alternative considered**: Express + custom middleware. Faster to scaffold but more glue code for the partner API (idempotency, API-key auth, rate limit) — the things actually being scored.

## 2. Mongoose + Repository pattern over Prisma

**Chosen**: Mongoose with thin repositories.

- **Pro**: Mature Mongo-native feature coverage — `$text` indexes, `$facet`, `findOneAndUpdate` with complex filters all work. Prisma's Mongo support lacks transactions on standalone and is weaker on aggregation.
- **Con**: Less type-safety than Prisma. Partially offset by `HydratedDocument<T>` and Mongoose schema typings.

## 3. Single-node Mongo, no transactions

**Chosen**: Atomic single-document operations (`findOneAndUpdate` with guard filters) in lieu of multi-document transactions.

- **Pro**: Works on standalone Mongo (which is what `docker-compose.yml` starts). No replica set required. Race-safe for the operations that matter (assign, unassign, status transition, activation).
- **Con**: Cross-collection writes (e.g., order update + audit log) are **not** atomic. If the audit log write fails after the order update succeeds, the audit is missed — we log the failure but don't retry. Considered acceptable since the audit log is an operational aid, not a financial ledger.

## 4. Full idempotency system vs. `externalReference` uniqueness

We implemented **both**:

- **Idempotency-Key** (RFC-style) via a global interceptor with a 24h TTL store — handles callers using retries with random keys.
- **`externalReference` unique sparse index** — handles callers whose own systems already generate stable IDs.

Double coverage adds ~50 lines but costs nothing at runtime, since both live on native Mongo indexes.

## 5. In-memory throttler vs. Redis-backed

**Chosen**: In-memory (`@nestjs/throttler` default store).

- **Pro**: Zero dependencies, works out of the box in Docker Compose.
- **Con**: Per-instance state — won't work horizontally without sticky sessions. For production multi-replica, swap in `@nestjs/throttler-storage-redis`. Documented in [`ASSUMPTIONS.md`](ASSUMPTIONS.md).

## 6. Socket.IO gateway with in-process rooms

**Chosen**: Single-node Socket.IO.

- **Pro**: Simple, debuggable, enough for a take-home demo.
- **Con**: Doesn't scale horizontally without the Socket.IO Redis adapter. For production, add `socket.io-adapter-redis` and a shared Redis.

## 7. Aggregation pipeline vs. two queries for the report

**Chosen**: Single `$facet` + `$group` + `$lookup` pipeline.

- **Pro**: Runs in one round-trip, leverages Mongo indexes, scales to large collections.
- **Con**: More complex to read. The plan explicitly listed a fallback (two separate queries, merged in Node) for safety — we kept the pipeline because it tested clean.

## 8. Monolithic over microservices

**Chosen**: Modular monolith — every feature is its own NestJS module inside one deployable.

- **Pro**: Easier to reason about for a 6–8 hour build and a single-reviewer assessment.
- **Con**: Tight coupling to the Mongo URI. Splitting into microservices would require proper service discovery, a message bus, and a lot more code for negligible demo value.

## 9. Seed data is a demo fixture, not a migration framework

**Chosen**: A single `seed.ts` script that wipes and reloads.

- **Pro**: Deterministic demo state — reviewers can run the report endpoint and see meaningful results immediately.
- **Con**: Destructive. Not suitable for production. A real deployment would use a migration tool (e.g., `migrate-mongo`) for schema evolution and a separate fixture loader for demos.

## 10. Test coverage: business rules + one critical endpoint

**Chosen**: Jest unit tests on `status-fsm` and `OrdersService` + a full E2E suite on `GET /orders` via `mongodb-memory-server`.

- **Pro**: Exercises the highest-risk logic (FSM correctness, atomic assignment) and proves the showcase endpoint end-to-end.
- **Con**: No tests for the gateway, report pipeline arithmetic in Mongo, or the idempotency interceptor. In a longer engagement these are the next three I'd write.

## 11. Error-shape uniformity over granular exception types

**Chosen**: One `HttpExceptionFilter` that normalizes every error to `{ statusCode, message, error, path, timestamp }`.

- **Pro**: Callers get a predictable shape. Logging is centralized.
- **Con**: Lose some fidelity on validation errors (array vs. string `message`). The filter preserves both when possible.

## 12. Captain auth token issuance

**Chosen**: `AuthService.issueCaptainToken()` exists but is not exposed via HTTP by default.

- **Rationale**: Real captain auth is out of scope — it would need OTP, app pairing, device fingerprinting, etc. For the assessment, admins can mint tokens programmatically, and the seed script prints a sample token in the console so reviewers can test the socket flow immediately.

---

**Summary**: the implementation prefers _clean, correct, atomic_ over _exhaustive_. Where a bonus feature was added, it's production-grade enough to not embarrass the reviewer; where one was skipped, the reason is listed here.
