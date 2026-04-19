import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';
import { Captain } from '../../src/modules/captains/schemas/captain.schema';
import { Order } from '../../src/modules/orders/schemas/order.schema';
import { LocationHistory } from '../../src/modules/locations/schemas/location-history.schema';
import { OrderStatus } from '../../src/common/enums/order-status.enum';
import {
  CaptainAvailability,
  CaptainStatus,
} from '../../src/common/enums/captain-status.enum';
import { Role } from '../../src/common/enums/role.enum';

// Override MONGO_URI to use isolated DB for this spec
process.env.MONGO_URI =
  (process.env.MONGO_URI ?? 'mongodb://mongo:27017/delivery_ops_test').replace(
    /\/[^/]+$/,
    '/delivery_ops_test_ws',
  );

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for event "${event}" after ${timeoutMs}ms`)),
      timeoutMs,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function connectSocket(url: string, token: string): ClientSocket {
  return ioClient(url, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
}

describe('Locations Socket (e2e)', () => {
  let app: INestApplication;
  let port: number;
  let jwt: JwtService;
  let captainModel: Model<Captain>;
  let orderModel: Model<Order>;
  let historyModel: Model<LocationHistory>;

  let activeCaptain: { _id: Types.ObjectId; id: string };
  let inactiveCaptain: { _id: Types.ObjectId; id: string };
  let captainToken: string;
  let inactiveCaptainToken: string;
  let adminToken: string;

  const sockets: ClientSocket[] = [];

  function track(s: ClientSocket): ClientSocket {
    sockets.push(s);
    return s;
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-at-least-16-chars-long';
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    // Listen on random port
    await app.listen(0);
    const addr = app.getHttpServer().address();
    port = typeof addr === 'object' && addr ? addr.port : 3001;

    jwt = app.get(JwtService);
    captainModel = app.get<Model<Captain>>(getModelToken(Captain.name));
    orderModel = app.get<Model<Order>>(getModelToken(Order.name));
    historyModel = app.get<Model<LocationHistory>>(getModelToken(LocationHistory.name));

    await captainModel.ensureIndexes();
    await orderModel.ensureIndexes();

    // Clean
    await captainModel.deleteMany({ phone: { $in: ['+962790000010', '+962790000011'] } });
    await historyModel.deleteMany({});

    const active = await captainModel.create({
      name: 'WS Active Captain',
      phone: '+962790000010',
      vehicleType: 'motorcycle',
      status: CaptainStatus.ACTIVE,
      availability: CaptainAvailability.ONLINE,
    });
    activeCaptain = { _id: active._id as Types.ObjectId, id: (active._id as Types.ObjectId).toString() };

    const inactive = await captainModel.create({
      name: 'WS Inactive Captain',
      phone: '+962790000011',
      vehicleType: 'car',
      status: CaptainStatus.INACTIVE,
      availability: CaptainAvailability.OFFLINE,
    });
    inactiveCaptain = { _id: inactive._id as Types.ObjectId, id: (inactive._id as Types.ObjectId).toString() };

    captainToken = await jwt.signAsync({ sub: activeCaptain.id, role: Role.CAPTAIN });
    inactiveCaptainToken = await jwt.signAsync({ sub: inactiveCaptain.id, role: Role.CAPTAIN });
    adminToken = await jwt.signAsync({ sub: new Types.ObjectId().toString(), role: Role.ADMIN });
  });

  afterAll(async () => {
    for (const s of sockets) {
      if (s.connected) s.disconnect();
    }
    await captainModel.deleteMany({ phone: { $in: ['+962790000010', '+962790000011'] } });
    await historyModel.deleteMany({});
    await app.close();
  });

  it('rejects connection with no token', (done) => {
    const s = track(
      ioClient(`http://localhost:${port}/locations`, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        auth: {},
      }),
    );
    let called = false;
    const finish = (msg?: string) => {
      if (called) return;
      called = true;
      if (msg !== undefined) expect(msg).toMatch(/unauthorized|missing/i);
      done();
    };
    s.on('error', (msg: string) => finish(msg));
    s.on('disconnect', () => finish());
  });

  it('rejects connection with invalid token', (done) => {
    const s = track(
      connectSocket(`http://localhost:${port}/locations`, 'invalid.token.here'),
    );
    let called = false;
    const finish = (msg?: string) => {
      if (called) return;
      called = true;
      if (msg !== undefined) expect(msg).toMatch(/unauthorized|invalid/i);
      done();
    };
    s.on('error', (msg: string) => finish(msg));
    s.on('disconnect', () => finish());
  });

  it('accepts valid captain token and connects', (done) => {
    const s = track(connectSocket(`http://localhost:${port}/locations`, captainToken));
    s.on('connect', () => {
      expect(s.connected).toBe(true);
      done();
    });
    s.on('connect_error', (err) => done(err));
  });

  it('accepts valid admin token and joins admins room', (done) => {
    const s = track(connectSocket(`http://localhost:${port}/locations`, adminToken));
    s.on('connect', () => {
      expect(s.connected).toBe(true);
      done();
    });
    s.on('connect_error', (err) => done(err));
  });

  it('active captain location update broadcasts to admin', async () => {
    const adminSocket = track(connectSocket(`http://localhost:${port}/locations`, adminToken));
    await waitForEvent(adminSocket, 'connect');

    const captainSocket = track(connectSocket(`http://localhost:${port}/locations`, captainToken));
    await waitForEvent(captainSocket, 'connect');

    const broadcastPromise = waitForEvent<{
      captainId: string;
      lat: number;
      lng: number;
      recordedAt: string;
    }>(adminSocket, 'captain:location:updated');

    captainSocket.emit('captain:location:update', { lat: 31.95, lng: 35.91 });

    const payload = await broadcastPromise;
    expect(payload.captainId).toBe(activeCaptain.id);
    expect(payload.lat).toBe(31.95);
    expect(payload.lng).toBe(35.91);
    expect(payload.recordedAt).toBeDefined();
  });

  it('location update persists to DB (currentLocation + history)', async () => {
    const captainSocket = track(connectSocket(`http://localhost:${port}/locations`, captainToken));
    await waitForEvent(captainSocket, 'connect');

    const adminSocket = track(connectSocket(`http://localhost:${port}/locations`, adminToken));
    await waitForEvent(adminSocket, 'connect');

    const broadcastPromise = waitForEvent(adminSocket, 'captain:location:updated');
    captainSocket.emit('captain:location:update', { lat: 32.0, lng: 36.0 });
    await broadcastPromise;

    const captain = await captainModel.findById(activeCaptain._id).lean();
    expect(captain?.currentLocation?.lat).toBe(32.0);
    expect(captain?.currentLocation?.lng).toBe(36.0);

    const history = await historyModel.findOne({ captainId: activeCaptain._id }).lean();
    expect(history).not.toBeNull();
    expect(history?.lat).toBe(32.0);
  });

  it('inactive captain location update is silently rejected (WsException)', async () => {
    const inactiveSocket = track(
      connectSocket(`http://localhost:${port}/locations`, inactiveCaptainToken),
    );
    await waitForEvent(inactiveSocket, 'connect');

    let errorReceived = false;
    inactiveSocket.on('exception', () => {
      errorReceived = true;
    });

    inactiveSocket.emit('captain:location:update', { lat: 31.0, lng: 35.0 });

    await new Promise((r) => setTimeout(r, 500));
    // WsException is emitted as 'exception' event in NestJS
    expect(errorReceived).toBe(true);
  });

  it('admin can subscribe to order room and receive location update', async () => {
    const order = await orderModel.create({
      orderNumber: `ORD-WS-${Date.now()}`,
      customerName: 'WS Test Customer',
      customerPhone: '+962799000099',
      region: 'Amman - Test',
      fullAddress: 'Test Address',
      location: { lat: 31.95, lng: 35.91 },
      status: OrderStatus.ASSIGNED,
      captainId: activeCaptain._id,
    });

    const adminSocket = track(connectSocket(`http://localhost:${port}/locations`, adminToken));
    await waitForEvent(adminSocket, 'connect');

    // Subscribe admin to this order's room
    const subscribeAck = await new Promise<{ ok: boolean }>((resolve) => {
      adminSocket.emit('admin:subscribe:order', { orderId: order._id.toString() }, resolve);
    });
    expect(subscribeAck.ok).toBe(true);

    const captainSocket = track(connectSocket(`http://localhost:${port}/locations`, captainToken));
    await waitForEvent(captainSocket, 'connect');

    const broadcastPromise = waitForEvent<{ captainId: string }>(
      adminSocket,
      'captain:location:updated',
    );
    captainSocket.emit('captain:location:update', { lat: 31.96, lng: 35.92 });

    const payload = await broadcastPromise;
    expect(payload.captainId).toBe(activeCaptain.id);

    await orderModel.deleteOne({ _id: order._id });
  });

  it('rejects invalid lat/lng (validation)', async () => {
    const captainSocket = track(connectSocket(`http://localhost:${port}/locations`, captainToken));
    await waitForEvent(captainSocket, 'connect');

    let exceptionReceived = false;
    captainSocket.on('exception', () => {
      exceptionReceived = true;
    });

    captainSocket.emit('captain:location:update', { lat: 999, lng: 35.91 });
    await new Promise((r) => setTimeout(r, 500));
    expect(exceptionReceived).toBe(true);
  });

  it('admin cannot emit captain:location:update', async () => {
    const adminSocket = track(connectSocket(`http://localhost:${port}/locations`, adminToken));
    await waitForEvent(adminSocket, 'connect');

    let exceptionReceived = false;
    adminSocket.on('exception', () => {
      exceptionReceived = true;
    });

    adminSocket.emit('captain:location:update', { lat: 31.95, lng: 35.91 });
    await new Promise((r) => setTimeout(r, 500));
    expect(exceptionReceived).toBe(true);
  });
});
