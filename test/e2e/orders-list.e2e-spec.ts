import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { Order } from '../../src/modules/orders/schemas/order.schema';
import { Captain } from '../../src/modules/captains/schemas/captain.schema';
import { OrderStatus } from '../../src/common/enums/order-status.enum';
import {
  CaptainAvailability,
  CaptainStatus,
} from '../../src/common/enums/captain-status.enum';
import { Role } from '../../src/common/enums/role.enum';

describe('Orders list (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let orderModel: Model<Order>;
  let captainModel: Model<Captain>;
  let captainId: Types.ObjectId;

  beforeAll(async () => {
    // MONGO_URI is injected via docker-compose env; JWT_SECRET must be set
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

    orderModel = app.get<Model<Order>>(getModelToken(Order.name));
    captainModel = app.get<Model<Captain>>(getModelToken(Captain.name));

    // Drop collections entirely so indexes are rebuilt fresh from schema
    try { await orderModel.collection.drop(); } catch { /* collection may not exist */ }
    try { await captainModel.collection.drop(); } catch { /* collection may not exist */ }
    await orderModel.syncIndexes();
    await captainModel.syncIndexes();

    const captain = await captainModel.create({
      name: 'E2E Captain',
      phone: '+962790000001',
      vehicleType: 'motorcycle',
      status: CaptainStatus.ACTIVE,
      availability: CaptainAvailability.ONLINE,
    });
    captainId = captain._id;

    const now = Date.now();
    const seeds: Array<Partial<Order> & { createdAt: Date; updatedAt: Date }> = [
      {
        orderNumber: 'ORD-E2E-0001', customerName: 'Alice Haddad', customerPhone: '+962799000001',
        region: 'Amman - Abdali', fullAddress: 'Addr 1', location: { lat: 31.95, lng: 35.91 },
        status: OrderStatus.CREATED, captainId: null,
        createdAt: new Date(now + 0), updatedAt: new Date(now + 0),
      },
      {
        orderNumber: 'ORD-E2E-0002', customerName: 'Bob Issa', customerPhone: '+962799000002',
        region: 'Amman - Abdali', fullAddress: 'Addr 2', location: { lat: 31.95, lng: 35.91 },
        status: OrderStatus.ASSIGNED, captainId,
        createdAt: new Date(now + 100), updatedAt: new Date(now + 100),
      },
      {
        orderNumber: 'ORD-E2E-0003', customerName: 'Carla Nimri', customerPhone: '+962799000003',
        region: 'Zarqa - Downtown', fullAddress: 'Addr 3', location: { lat: 32.07, lng: 36.09 },
        status: OrderStatus.DELIVERED, captainId,
        createdAt: new Date(now + 200), updatedAt: new Date(now + 200),
      },
      {
        orderNumber: 'ORD-E2E-0004', customerName: 'Dana Hijazi', customerPhone: '+962799000004',
        region: 'Amman - Sweifieh', fullAddress: 'Addr 4', location: { lat: 31.95, lng: 35.85 },
        status: OrderStatus.CANCELLED, captainId: null,
        createdAt: new Date(now + 300), updatedAt: new Date(now + 300),
      },
      {
        orderNumber: 'ORD-E2E-0005', customerName: 'Eli Khoury', customerPhone: '+962799000005',
        region: 'Amman - Abdali', fullAddress: 'Addr 5', location: { lat: 31.95, lng: 35.91 },
        status: OrderStatus.CREATED, captainId: null,
        createdAt: new Date(now + 400), updatedAt: new Date(now + 400),
      },
    ];
    await orderModel.insertMany(seeds);

    const jwt = app.get(JwtService);
    token = await jwt.signAsync({ sub: new Types.ObjectId().toString(), role: Role.ADMIN });
  });

  afterAll(async () => {
    await orderModel.deleteMany({ orderNumber: /^ORD-E2E-/ });
    await captainModel.deleteMany({ phone: '+962790000001' });
    await app.close();
  });

  it('requires authentication', () => {
    return request(app.getHttpServer()).get('/orders').expect(401);
  });

  it('returns paginated list with meta', async () => {
    const res = await request(app.getHttpServer())
      .get('/orders?q=ORD-E2E&page=1&limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.length).toBe(5);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 10, total: 5, totalPages: 1 });
  });

  it('filters by status', async () => {
    const res = await request(app.getHttpServer())
      .get('/orders?q=ORD-E2E&status=created')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.every((o: { status: string }) => o.status === 'created')).toBe(true);
    expect(res.body.meta.total).toBe(2);
  });

  it('filters by region', async () => {
    const res = await request(app.getHttpServer())
      .get('/orders?q=ORD-E2E&region=Amman%20-%20Abdali')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBe(3);
  });

  it('filters by captainId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders?q=ORD-E2E&captainId=${captainId.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBe(2);
  });

  it('filters by assignmentState=unassigned', async () => {
    const res = await request(app.getHttpServer())
      .get('/orders?q=ORD-E2E&assignmentState=unassigned')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.every((o: { captainId: string | null }) => !o.captainId)).toBe(true);
  });

  it('searches by customer name (text index)', async () => {
    const res = await request(app.getHttpServer())
      .get('/orders?q=Carla')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].customerName).toContain('Carla');
  });

  it('sorts by createdAt asc vs desc', async () => {
    const asc = await request(app.getHttpServer())
      .get('/orders?q=ORD-E2E&sortBy=createdAt&sortOrder=asc&limit=100')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const desc = await request(app.getHttpServer())
      .get('/orders?q=ORD-E2E&sortBy=createdAt&sortOrder=desc&limit=100')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ascNumbers = asc.body.data.map((o: { orderNumber: string }) => o.orderNumber);
    const descNumbers = desc.body.data.map((o: { orderNumber: string }) => o.orderNumber);
    expect(ascNumbers).toEqual([...descNumbers].reverse());
  });

  it('rejects invalid query params', () => {
    return request(app.getHttpServer())
      .get('/orders?limit=9999')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
