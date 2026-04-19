/* eslint-disable no-console */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import mongoose, { Types } from 'mongoose';
import { UserSchema } from '../modules/auth/schemas/user.schema';
import { CaptainSchema } from '../modules/captains/schemas/captain.schema';
import { OrderSchema } from '../modules/orders/schemas/order.schema';
import { ApiKeySchema } from '../modules/partner/schemas/api-key.schema';
import { Role } from '../common/enums/role.enum';
import {
  CaptainAvailability,
  CaptainStatus,
} from '../common/enums/captain-status.enum';
import { OrderStatus } from '../common/enums/order-status.enum';

dotenv.config();

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/delivery_ops';
  await mongoose.connect(uri);
  console.log(`→ Connected to ${uri}`);

  const UserModel = mongoose.model('User', UserSchema);
  const CaptainModel = mongoose.model('Captain', CaptainSchema);
  const OrderModel = mongoose.model('Order', OrderSchema);
  const ApiKeyModel = mongoose.model('ApiKey', ApiKeySchema);

  await Promise.all([
    UserModel.deleteMany({}),
    CaptainModel.deleteMany({}),
    OrderModel.deleteMany({}),
    ApiKeyModel.deleteMany({}),
  ]);
  console.log('→ Cleared collections');

  // ── Admin user ─────────────────────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  await UserModel.create({
    email: adminEmail.toLowerCase(),
    passwordHash: await bcrypt.hash(adminPassword, 10),
    role: Role.ADMIN,
  });
  console.log(`→ Admin:        ${adminEmail} / ${adminPassword}`);

  // ── Partner API key ────────────────────────────────────────────────────
  const rawKey = `pk_${crypto.randomBytes(24).toString('hex')}`;
  await ApiKeyModel.create({
    name: 'Demo Partner',
    prefix: rawKey.slice(0, 8),
    hashedKey: await bcrypt.hash(rawKey, 10),
    active: true,
  });
  console.log(`→ Partner key:  ${rawKey}`);
  console.log('   (Save this now — it is stored only as a bcrypt hash.)');

  // ── Captains ───────────────────────────────────────────────────────────
  const captainSeeds = [
    {
      name: 'Ahmad Khaled',
      phone: '+962791111001',
      vehicleType: 'motorcycle',
      status: CaptainStatus.ACTIVE,
      availability: CaptainAvailability.ONLINE,
    },
    {
      name: 'Layla Nasser',
      phone: '+962791111002',
      vehicleType: 'car',
      status: CaptainStatus.ACTIVE,
      availability: CaptainAvailability.ONLINE,
    },
    {
      name: 'Omar Saleh',
      phone: '+962791111003',
      vehicleType: 'motorcycle',
      status: CaptainStatus.ACTIVE,
      availability: CaptainAvailability.OFFLINE,
    },
    {
      name: 'Huda Faris',
      phone: '+962791111004',
      vehicleType: 'bicycle',
      status: CaptainStatus.ACTIVE,
      availability: CaptainAvailability.OFFLINE,
    },
    {
      name: 'Samir Abbas',
      phone: '+962791111005',
      vehicleType: 'car',
      status: CaptainStatus.INACTIVE,
      availability: CaptainAvailability.OFFLINE,
    },
    {
      name: 'Yasmine Tarek',
      phone: '+962791111006',
      vehicleType: 'motorcycle',
      status: CaptainStatus.INACTIVE,
      availability: CaptainAvailability.OFFLINE,
    },
  ];
  const captains = await CaptainModel.insertMany(captainSeeds);
  console.log(`→ Captains:     ${captains.length} (4 active, 2 inactive)`);

  // ── Orders (spread across statuses, regions, and date windows for report) ──
  const regions = ['Amman - Abdali', 'Amman - Sweifieh', 'Amman - Dahyeh', 'Zarqa - Downtown'];
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 3600 * 1000);

  const orderSeeds: Array<Record<string, unknown>> = [];

  // Previous window (60-31 days ago): captain[0] gets 12 orders, captain[1] gets 8, captain[2] gets 4.
  const previousDistribution: Array<[number, number]> = [[0, 12], [1, 8], [2, 4]];
  let orderIdx = 0;
  for (const [capIdx, count] of previousDistribution) {
    for (let i = 0; i < count; i++) {
      orderIdx++;
      orderSeeds.push({
        orderNumber: `SEED-PREV-${orderIdx.toString().padStart(4, '0')}`,
        customerName: `Prev Customer ${orderIdx}`,
        customerPhone: `+96279200${orderIdx.toString().padStart(4, '0')}`,
        region: regions[orderIdx % regions.length],
        fullAddress: `Address line ${orderIdx}`,
        location: { lat: 31.95 + (orderIdx % 10) * 0.001, lng: 35.91 + (orderIdx % 10) * 0.001 },
        status: OrderStatus.DELIVERED,
        captainId: captains[capIdx]._id,
        createdAt: daysAgo(45 + (i % 14)),
        updatedAt: daysAgo(40),
      });
    }
  }

  // Current window (30 days ago → today): captain[0] gets 3 (big drop), captain[1] gets 6 (small drop), captain[2] gets 4 (no drop).
  const currentDistribution: Array<[number, number]> = [[0, 3], [1, 6], [2, 4]];
  for (const [capIdx, count] of currentDistribution) {
    for (let i = 0; i < count; i++) {
      orderIdx++;
      orderSeeds.push({
        orderNumber: `SEED-CURR-${orderIdx.toString().padStart(4, '0')}`,
        customerName: `Curr Customer ${orderIdx}`,
        customerPhone: `+96279100${orderIdx.toString().padStart(4, '0')}`,
        region: regions[orderIdx % regions.length],
        fullAddress: `Address line ${orderIdx}`,
        location: { lat: 31.95 + (orderIdx % 10) * 0.001, lng: 35.91 + (orderIdx % 10) * 0.001 },
        status: OrderStatus.DELIVERED,
        captainId: captains[capIdx]._id,
        createdAt: daysAgo(15 + (i % 10)),
        updatedAt: daysAgo(10),
      });
    }
  }

  // A few live orders in assorted statuses so list endpoint demos well.
  const liveSeeds = [
    { status: OrderStatus.CREATED, captainId: null },
    { status: OrderStatus.CREATED, captainId: null },
    { status: OrderStatus.ASSIGNED, captainId: captains[0]._id as Types.ObjectId },
    { status: OrderStatus.PICKED_UP, captainId: captains[1]._id as Types.ObjectId },
    { status: OrderStatus.CANCELLED, captainId: null },
  ];
  for (const seed of liveSeeds) {
    orderIdx++;
    orderSeeds.push({
      orderNumber: `SEED-LIVE-${orderIdx.toString().padStart(4, '0')}`,
      customerName: `Live Customer ${orderIdx}`,
      customerPhone: `+96279000${orderIdx.toString().padStart(4, '0')}`,
      region: regions[orderIdx % regions.length],
      fullAddress: `Address line ${orderIdx}`,
      location: { lat: 31.95, lng: 35.91 },
      status: seed.status,
      captainId: seed.captainId,
    });
  }

  // Force insertion preserving custom createdAt (Mongoose timestamps normally override).
  await OrderModel.insertMany(orderSeeds, { lean: false });
  console.log(`→ Orders:       ${orderSeeds.length} total`);
  console.log('  - 24 in previous window (captains 1-3: 12/8/4 orders)');
  console.log('  - 13 in current window  (captains 1-3: 3/6/4 orders → drops)');
  console.log(`  - ${liveSeeds.length} live orders across statuses for demo`);

  await mongoose.disconnect();
  console.log('\nSeeding complete.\n');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
