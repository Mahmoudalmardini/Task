# API Testing Guide — Delivery Operations Backend

Complete end-to-end walkthrough. Follow the steps in order — each step builds on the previous one (tokens, IDs, keys).

**Base URL**: `http://localhost:3000`  
**Swagger UI**: `http://localhost:3000/api`

---

## Prerequisites

Make sure the app is running:

```bash
docker compose up --build
```

Grab the **partner API key** from the seed logs (printed once on startup):

```bash
docker compose logs seed | grep "Raw API key"
```

Copy the key — you'll need it in Step 6.

---

## Step 1 — Admin Login

Get the JWT token used by all admin endpoints.

**POST** `/auth/login`

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin@123"
  }'
```

**Expected response** `200 OK`:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

> **Save the token** — replace `<TOKEN>` in all steps below with this value.

**Error cases to test:**
- Wrong password → `401 Unauthorized`
- Missing email field → `400 Bad Request`

---

## Step 2 — Captain Management

### 2a. Create a Captain

**POST** `/captains`

```bash
curl -s -X POST http://localhost:3000/captains \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tariq Mansour",
    "phone": "+962791000001",
    "vehicleType": "motorcycle",
    "status": "active",
    "availability": "offline"
  }'
```

**Expected response** `201 Created`:
```json
{
  "_id": "...",
  "name": "Tariq Mansour",
  "phone": "+962791000001",
  "vehicleType": "motorcycle",
  "status": "active",
  "availability": "offline",
  "currentLocation": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

> **Save the `_id`** — replace `<CAPTAIN_ID>` below with this value.

**Error cases:**
- Duplicate phone → `409 Conflict`
- Invalid phone format (not E.164) → `400 Bad Request`
- Missing required field → `400 Bad Request`
- No token → `401 Unauthorized`

---

### 2b. List Captains (with filters)

**GET** `/captains?status=active&page=1&limit=10`

```bash
curl -s "http://localhost:3000/captains?status=active&page=1&limit=10" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected response** `200 OK`:
```json
{
  "data": [ ... ],
  "meta": { "page": 1, "limit": 10, "total": 5, "totalPages": 1 }
}
```

---

### 2c. Get Captain by ID

**GET** `/captains/:id`

```bash
curl -s "http://localhost:3000/captains/<CAPTAIN_ID>" \
  -H "Authorization: Bearer <TOKEN>"
```

---

### 2d. Update a Captain

**PATCH** `/captains/:id`

```bash
curl -s -X PATCH "http://localhost:3000/captains/<CAPTAIN_ID>" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleType": "car",
    "availability": "online"
  }'
```

---

### 2e. Deactivate a Captain

**POST** `/captains/:id/deactivate`

```bash
curl -s -X POST "http://localhost:3000/captains/<CAPTAIN_ID>/deactivate" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected**: captain `status` becomes `"inactive"`.

---

### 2f. Reactivate a Captain

**POST** `/captains/:id/activate`

```bash
curl -s -X POST "http://localhost:3000/captains/<CAPTAIN_ID>/activate" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected**: captain `status` becomes `"active"`.

> Keep the captain **active** for the assignment steps below.

---

## Step 3 — Order Management (Admin)

### 3a. Create an Order

**POST** `/orders`

```bash
curl -s -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "orderNumber": "ORD-TEST-0001",
    "customerName": "Layla Hassan",
    "customerPhone": "+962790000001",
    "region": "Amman - Abdali",
    "fullAddress": "Building 14, 3rd floor, Abdali Boulevard, Amman",
    "location": { "lat": 31.9539, "lng": 35.9106 }
  }'
```

**Expected response** `201 Created` with `"status": "created"` and `"captainId": null`.

> **Save the `_id`** — replace `<ORDER_ID>` below with this value.

**Error cases:**
- Duplicate `orderNumber` → `409 Conflict`
- `lat` out of range (e.g. 999) → `400 Bad Request`
- Invalid phone → `400 Bad Request`

---

### 3b. List Orders — Basic

**GET** `/orders`

```bash
curl -s "http://localhost:3000/orders" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected**: paginated list, default `page=1`, `limit=20`.

---

### 3c. List Orders — Filter by Status

```bash
curl -s "http://localhost:3000/orders?status=created" \
  -H "Authorization: Bearer <TOKEN>"
```

---

### 3d. List Orders — Filter by Region

```bash
curl -s "http://localhost:3000/orders?region=Amman%20-%20Abdali" \
  -H "Authorization: Bearer <TOKEN>"
```

---

### 3e. List Orders — Text Search

Searches across `orderNumber`, `customerName`, `customerPhone`:

```bash
curl -s "http://localhost:3000/orders?q=Layla" \
  -H "Authorization: Bearer <TOKEN>"
```

---

### 3f. List Orders — Combined Filter + Sort + Paginate

```bash
curl -s "http://localhost:3000/orders?status=created&region=Amman%20-%20Abdali&sortBy=createdAt&sortOrder=desc&page=1&limit=5" \
  -H "Authorization: Bearer <TOKEN>"
```

---

### 3g. List Orders — Assignment State Filter

```bash
# Only unassigned orders
curl -s "http://localhost:3000/orders?assignmentState=unassigned" \
  -H "Authorization: Bearer <TOKEN>"

# Only assigned orders
curl -s "http://localhost:3000/orders?assignmentState=assigned" \
  -H "Authorization: Bearer <TOKEN>"
```

---

### 3h. List Orders — Date Range Filter

```bash
curl -s "http://localhost:3000/orders?from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z" \
  -H "Authorization: Bearer <TOKEN>"
```

---

### 3i. Get Order by ID

```bash
curl -s "http://localhost:3000/orders/<ORDER_ID>" \
  -H "Authorization: Bearer <TOKEN>"
```

---

## Step 4 — Order Assignment & Status Flow

The full order lifecycle: `created → assigned → picked_up → delivered`

### 4a. Assign Order to Captain

**POST** `/orders/:id/assign`

```bash
curl -s -X POST "http://localhost:3000/orders/<ORDER_ID>/assign" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "captainId": "<CAPTAIN_ID>" }'
```

**Expected**: order status becomes `"assigned"`, `captainId` set.

**Error cases:**
- Captain is `inactive` → `409 Conflict` with message `"Captain is inactive"`
- Order already `delivered` or `cancelled` → `409 Conflict`
- Non-existent captainId → `404 Not Found`

---

### 4b. Unassign Order

**POST** `/orders/:id/unassign`

```bash
curl -s -X POST "http://localhost:3000/orders/<ORDER_ID>/unassign" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected**: status reverts to `"created"`, `captainId` becomes `null`.

**Error case**: order status is `picked_up` or later → `409 Conflict` (can't unassign after pickup).

Re-assign the order to the captain before continuing:
```bash
curl -s -X POST "http://localhost:3000/orders/<ORDER_ID>/assign" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "captainId": "<CAPTAIN_ID>" }'
```

---

### 4c. Advance Status — Picked Up

**PATCH** `/orders/:id/status`

```bash
curl -s -X PATCH "http://localhost:3000/orders/<ORDER_ID>/status" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "picked_up" }'
```

**Expected**: status becomes `"picked_up"`.

---

### 4d. Advance Status — Delivered

```bash
curl -s -X PATCH "http://localhost:3000/orders/<ORDER_ID>/status" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "delivered" }'
```

**Expected**: status becomes `"delivered"` (terminal — no further transitions allowed).

---

### 4e. Test Invalid Transitions (FSM enforcement)

Try to cancel a delivered order — must be rejected:
```bash
curl -s -X PATCH "http://localhost:3000/orders/<ORDER_ID>/status" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "cancelled" }'
```

**Expected** `422 Unprocessable Entity` — invalid state transition.

---

### 4f. Cancel a Different Order

Create a fresh order and cancel it directly from `created`:

```bash
curl -s -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "orderNumber": "ORD-TEST-CANCEL",
    "customerName": "Test Cancel",
    "customerPhone": "+962790000099",
    "region": "Amman - Sweifieh",
    "fullAddress": "Test Street, Amman",
    "location": { "lat": 31.95, "lng": 35.85 }
  }'
```

Then cancel it (replace `<NEW_ORDER_ID>` with the returned `_id`):

```bash
curl -s -X PATCH "http://localhost:3000/orders/<NEW_ORDER_ID>/status" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "cancelled" }'
```

---

### 4g. Delete an Order

```bash
curl -s -X DELETE "http://localhost:3000/orders/<NEW_ORDER_ID>" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected** `200 OK` or `204 No Content`.

---

## Step 5 — WebSocket: Live Captain Location

The Socket.IO namespace is `/locations`. Captains authenticate with a JWT.

### 5a. Get a Captain JWT

The seed script prints a captain token. Alternatively, you can get one via the internal endpoint:

```bash
curl -s -X POST http://localhost:3000/auth/captain-token \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "captainId": "<CAPTAIN_ID>" }'
```

> **Save the captain token** as `<CAPTAIN_TOKEN>`.

---

### 5b. Test with a Browser / Node.js Snippet

Open your browser console or a Node.js script. Install `socket.io-client` if needed:

```bash
npm install socket.io-client
```

**Node.js test client:**

```js
const { io } = require('socket.io-client');

const captainSocket = io('http://localhost:3000/locations', {
  auth: { token: '<CAPTAIN_TOKEN>' },
});

captainSocket.on('connect', () => {
  console.log('Captain connected:', captainSocket.id);

  // Send a location update
  captainSocket.emit('captain:location:update', { lat: 31.9539, lng: 35.9106 });
});

captainSocket.on('captain:location:updated', (data) => {
  console.log('Location broadcast received:', data);
  // { captainId, lat, lng, recordedAt }
});

captainSocket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
});
```

---

### 5c. Admin Subscribing to an Order Room

Connect a second socket as admin to receive updates for a specific order:

```js
const adminSocket = io('http://localhost:3000/locations', {
  auth: { token: '<ADMIN_TOKEN>' },  // admin JWT from Step 1
});

adminSocket.on('connect', () => {
  console.log('Admin connected');

  // Subscribe to a specific order's captain location
  adminSocket.emit('admin:subscribe:order', { orderId: '<ORDER_ID>' });
});

adminSocket.on('captain:location:updated', (data) => {
  console.log('Admin received update for assigned captain:', data);
});
```

When the captain emits `captain:location:update`, the admin should receive `captain:location:updated`.

---

### 5d. Rejected Location Update (Inactive Captain)

Deactivate the captain first:

```bash
curl -s -X POST "http://localhost:3000/captains/<CAPTAIN_ID>/deactivate" \
  -H "Authorization: Bearer <TOKEN>"
```

Then emit a location update from the captain socket — the server must **silently reject** the event (no broadcast, no update to DB).

Reactivate when done:

```bash
curl -s -X POST "http://localhost:3000/captains/<CAPTAIN_ID>/activate" \
  -H "Authorization: Bearer <TOKEN>"
```

---

## Step 6 — Partner API

Uses `X-API-Key` header instead of JWT. Grab the key from seed logs (Step 0).

### 6a. Create a Partner Order

**POST** `/partner/orders`

```bash
curl -s -X POST http://localhost:3000/partner/orders \
  -H "X-API-Key: <PARTNER_API_KEY>" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440001" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Sara Ahmad",
    "customerPhone": "+962799000001",
    "region": "Amman - Sweifieh",
    "fullAddress": "Al-Wakalat Street, near Cozmo, Amman",
    "location": { "lat": 31.9539, "lng": 35.85 },
    "externalReference": "PARTNER-REF-TEST-001"
  }'
```

**Expected** `201 Created` with a new order ID.

---

### 6b. Replay the Same Idempotency Key

Send the **exact same request** again (same `Idempotency-Key` + same body):

```bash
curl -s -X POST http://localhost:3000/partner/orders \
  -H "X-API-Key: <PARTNER_API_KEY>" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440001" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Sara Ahmad",
    "customerPhone": "+962799000001",
    "region": "Amman - Sweifieh",
    "fullAddress": "Al-Wakalat Street, near Cozmo, Amman",
    "location": { "lat": 31.9539, "lng": 35.85 },
    "externalReference": "PARTNER-REF-TEST-001"
  }'
```

**Expected**: same `201` response body as before, with response header `Idempotency-Replayed: true`. No duplicate order created.

---

### 6c. Same Idempotency Key — Different Body (Conflict)

Send the same `Idempotency-Key` but change any field in the body:

```bash
curl -s -X POST http://localhost:3000/partner/orders \
  -H "X-API-Key: <PARTNER_API_KEY>" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440001" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "DIFFERENT NAME",
    "customerPhone": "+962799000001",
    "region": "Amman - Sweifieh",
    "fullAddress": "Al-Wakalat Street, near Cozmo, Amman",
    "location": { "lat": 31.9539, "lng": 35.85 }
  }'
```

**Expected** `409 Conflict` — body hash mismatch for existing idempotency key.

---

### 6d. Duplicate externalReference (Conflict)

Try creating another order with the same `externalReference`:

```bash
curl -s -X POST http://localhost:3000/partner/orders \
  -H "X-API-Key: <PARTNER_API_KEY>" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440099" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Another Customer",
    "customerPhone": "+962799000002",
    "region": "Amman - Abdali",
    "fullAddress": "Some Street, Amman",
    "location": { "lat": 31.96, "lng": 35.91 },
    "externalReference": "PARTNER-REF-TEST-001"
  }'
```

**Expected** `409 Conflict` — `externalReference` already exists.

---

### 6e. Missing or Invalid API Key

```bash
curl -s -X POST http://localhost:3000/partner/orders \
  -H "X-API-Key: invalid-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Test",
    "customerPhone": "+962799000003",
    "region": "Amman",
    "fullAddress": "Test",
    "location": { "lat": 31.9, "lng": 35.9 }
  }'
```

**Expected** `401 Unauthorized`.

---

### 6f. Rate Limiting

Send 61 requests rapidly (the limit is 60/min). The 61st should return `429 Too Many Requests`.

Quick shell loop test:

```bash
for i in $(seq 1 61); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/partner/orders \
    -H "X-API-Key: <PARTNER_API_KEY>" \
    -H "Idempotency-Key: rate-limit-test-${i}" \
    -H "Content-Type: application/json" \
    -d "{\"customerName\":\"Test ${i}\",\"customerPhone\":\"+96279900${i}00\",\"region\":\"Amman\",\"fullAddress\":\"Street ${i}\",\"location\":{\"lat\":31.9,\"lng\":35.9}}")
  echo "Request ${i}: HTTP ${STATUS}"
done
```

**Expected**: first 60 return `201`, request 61 returns `429`.

---

## Step 7 — Reports

### 7a. Get Seed Date Windows

The seed creates orders relative to the day it ran. To get the correct windows, compute:

- **Previous window**: 60 days ago → 31 days ago
- **Current window**: 30 days ago → today

Example (replace with actual dates from when you ran `docker compose up`):

```
previousFrom = <seed_date - 60 days>T00:00:00Z
previousTo   = <seed_date - 31 days>T23:59:59Z
currentFrom  = <seed_date - 30 days>T00:00:00Z
currentTo    = <seed_date>T23:59:59Z
```

**Tip**: if you ran Docker today (2026-04-19), use:

```
previousFrom=2026-02-18T00:00:00Z
previousTo=2026-03-19T23:59:59Z
currentFrom=2026-03-20T00:00:00Z
currentTo=2026-04-19T23:59:59Z
```

---

### 7b. Order Volume Drop Report

**GET** `/reports/captains/order-volume-drop`

```bash
curl -s "http://localhost:3000/reports/captains/order-volume-drop?\
previousFrom=2026-02-18T00:00:00Z&\
previousTo=2026-03-19T23:59:59Z&\
currentFrom=2026-03-20T00:00:00Z&\
currentTo=2026-04-19T23:59:59Z&\
minPreviousOrders=1&\
minDropPercentage=0&\
sortBy=dropPercentage&\
sortOrder=desc&\
page=1&\
limit=10" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected response** `200 OK`:
```json
{
  "data": [
    {
      "captainId": "...",
      "captainName": "Ahmad Khaled",
      "previousOrders": 12,
      "currentOrders": 4,
      "dropCount": 8,
      "dropPercentage": 66.67
    },
    {
      "captainId": "...",
      "captainName": "Layla Nasser",
      "previousOrders": 8,
      "currentOrders": 6,
      "dropCount": 2,
      "dropPercentage": 25
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 2, "totalPages": 1 }
}
```

> Captains with no drop (e.g. 4 previous → 4 current) should **not** appear.

---

### 7c. Report — With minDropPercentage Filter

```bash
curl -s "http://localhost:3000/reports/captains/order-volume-drop?\
previousFrom=2026-02-18T00:00:00Z&\
previousTo=2026-03-19T23:59:59Z&\
currentFrom=2026-03-20T00:00:00Z&\
currentTo=2026-04-19T23:59:59Z&\
minPreviousOrders=5&\
minDropPercentage=50" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected**: only captains with ≥50% drop and ≥5 previous orders (Ahmad Khaled only).

---

### 7d. Report — Overlapping Windows (Validation Error)

```bash
curl -s "http://localhost:3000/reports/captains/order-volume-drop?\
previousFrom=2026-01-01T00:00:00Z&\
previousTo=2026-04-01T00:00:00Z&\
currentFrom=2026-03-01T00:00:00Z&\
currentTo=2026-04-19T23:59:59Z" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected** `400 Bad Request` — previous period must end before current period starts.

---

## Step 8 — Cleanup / Edge Cases

### 8a. Access Admin Endpoint Without Token

```bash
curl -s http://localhost:3000/captains
```

**Expected** `401 Unauthorized`.

---

### 8b. Non-Existent Resource

```bash
curl -s "http://localhost:3000/orders/000000000000000000000000" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected** `404 Not Found`.

---

### 8c. Invalid MongoDB ObjectId

```bash
curl -s "http://localhost:3000/orders/not-an-id" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected** `400 Bad Request` — invalid ObjectId format.

---

## Quick Reference — Variable Checklist

| Variable | Where to get it | Example |
|---|---|---|
| `<TOKEN>` | Step 1 login response | `eyJhbGci...` |
| `<CAPTAIN_ID>` | Step 2a create response `_id` | `6621f3a0...` |
| `<ORDER_ID>` | Step 3a create response `_id` | `6621f4b1...` |
| `<CAPTAIN_TOKEN>` | Step 5a response | `eyJhbGci...` |
| `<PARTNER_API_KEY>` | `docker compose logs seed` | `pk_6734edc0...` |

---

## Using Swagger UI Instead of cURL

All endpoints above can be tested interactively at **http://localhost:3000/api**:

1. Click **Authorize** (top right)
2. For admin endpoints: paste `<TOKEN>` in the **Bearer** field
3. For partner endpoints: paste `<PARTNER_API_KEY>` in the **X-API-Key** field
4. Expand any endpoint and click **Try it out**
