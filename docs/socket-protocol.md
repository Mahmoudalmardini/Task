# Socket.IO Protocol — `/locations`

Real-time captain location stream for admins and per-order subscribers.

---

## Connection

- **URL**: `ws://localhost:3000/locations` (or the host where the app is deployed)
- **Transport**: Socket.IO v4 (websocket + polling fallback)

## Authentication

Provide a JWT on the handshake. Two equivalent ways:

```js
// Option A — auth object (preferred)
const socket = io('http://localhost:3000/locations', {
  auth: { token: '<JWT>' },
});

// Option B — Authorization header
const socket = io('http://localhost:3000/locations', {
  extraHeaders: { Authorization: 'Bearer <JWT>' },
});
```

| Role     | Where the token comes from                                      |
|----------|-----------------------------------------------------------------|
| `admin`  | `POST /auth/login`                                              |
| `captain`| Issued programmatically via `AuthService.issueCaptainToken(id)` |

Invalid or missing tokens cause the server to emit `error` and disconnect immediately.

On successful connect:

- Admins auto-join the `admins` room.
- Captains do not auto-join any broadcast room; they only emit.

---

## Events

### Client → server

#### `captain:location:update`
Sent by captains to report a new GPS fix.

```json
{ "lat": 31.95, "lng": 35.91 }
```

Rules:

- Only sockets authed as `captain` may emit this.
- `lat` ∈ [-90, 90], `lng` ∈ [-180, 180] — enforced by `class-validator`.
- Rejected with `WsException` if the captain is INACTIVE (atomic filter in Mongo).

Server persists to:

1. `captains.currentLocation` (overwrite latest)
2. `location_history` (append)

Server response (acknowledgement): `{ ok: true }`.

#### `admin:subscribe:order`
Admins call this to follow live updates for a particular order.

```json
{ "orderId": "65f0c1b4a2d1e4a3b3f8e9a1" }
```

Only sockets authed as `admin` may emit this; the socket joins the `order:<orderId>` room.

### Server → client

#### `captain:location:updated`
Broadcast to:

- Every socket in the `admins` room.
- Every socket in `order:<orderId>` rooms where that order is currently assigned to the captain in question (status ∈ {ASSIGNED, PICKED_UP}).

Payload:

```json
{
  "captainId": "65f0c1b4a2d1e4a3b3f8e9a1",
  "lat": 31.95,
  "lng": 35.91,
  "recordedAt": "2026-04-19T10:45:00.000Z"
}
```

#### `error`
Emitted before the server disconnects on auth failures. String message.

---

## Sample admin client (Node.js)

```js
import { io } from 'socket.io-client';

const adminJwt = 'eyJ...';   // from POST /auth/login
const socket = io('http://localhost:3000/locations', { auth: { token: adminJwt } });

socket.on('connect', () => console.log('connected', socket.id));
socket.on('captain:location:updated', (payload) => console.log('live:', payload));
socket.on('error', (msg) => console.warn('socket error:', msg));

// Follow a specific order
socket.emit('admin:subscribe:order', { orderId: '65f0c1b4a2d1e4a3b3f8e9a1' });
```

## Sample captain client (Node.js)

```js
import { io } from 'socket.io-client';

const captainJwt = 'eyJ...';   // issued internally for the captain
const socket = io('http://localhost:3000/locations', { auth: { token: captainJwt } });

setInterval(() => {
  socket.emit(
    'captain:location:update',
    { lat: 31.95 + Math.random() * 0.01, lng: 35.91 + Math.random() * 0.01 },
    (ack) => console.log('ack:', ack),
  );
}, 5000);
```

---

## Production considerations

- **Horizontal scaling**: add the `socket.io-adapter-redis` adapter so multiple app instances share room state.
- **Heartbeat / reconnect**: Socket.IO handles both by default; if the JWT expires mid-stream, the server disconnects on the next message that requires auth context.
- **Back-pressure**: current implementation broadcasts on every update. For high-frequency clients, debounce server-side (e.g. emit at most every 2s per captain).
