import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { OrderRepository } from '../../src/modules/orders/repositories/order.repository';
import { CaptainsService } from '../../src/modules/captains/captains.service';
import { AuditLogService } from '../../src/modules/audit-log/audit-log.service';
import { OrderStatus } from '../../src/common/enums/order-status.enum';

function mockOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: new Types.ObjectId(),
    status: OrderStatus.CREATED,
    captainId: null,
    orderNumber: 'ORD-TEST',
    ...overrides,
  };
}

describe('OrdersService', () => {
  let svc: OrdersService;
  let repo: jest.Mocked<OrderRepository>;
  let captains: jest.Mocked<CaptainsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: OrderRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            atomicAssign: jest.fn(),
            atomicUnassign: jest.fn(),
            atomicTransitionStatus: jest.fn(),
          },
        },
        {
          provide: CaptainsService,
          useValue: { isActive: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    svc = module.get(OrdersService);
    repo = module.get(OrderRepository);
    captains = module.get(CaptainsService);
  });

  describe('assign', () => {
    it('rejects when captain is inactive', async () => {
      captains.isActive.mockResolvedValue(false);
      await expect(svc.assign('o1', 'c1')).rejects.toThrow(ConflictException);
      expect(repo.atomicAssign).not.toHaveBeenCalled();
    });

    it('rejects when atomic assign returns null and order is not found', async () => {
      captains.isActive.mockResolvedValue(true);
      repo.atomicAssign.mockResolvedValue(null);
      repo.findById.mockResolvedValue(null);
      await expect(svc.assign(new Types.ObjectId().toString(), new Types.ObjectId().toString())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects when atomic assign returns null because order is already assigned', async () => {
      captains.isActive.mockResolvedValue(true);
      repo.atomicAssign.mockResolvedValue(null);
      repo.findById.mockResolvedValue(
        mockOrder({ status: OrderStatus.ASSIGNED, captainId: new Types.ObjectId() }) as never,
      );
      await expect(svc.assign(new Types.ObjectId().toString(), new Types.ObjectId().toString())).rejects.toThrow(
        ConflictException,
      );
    });

    it('succeeds when order is CREATED and captain is active', async () => {
      captains.isActive.mockResolvedValue(true);
      const updated = mockOrder({ status: OrderStatus.ASSIGNED, captainId: new Types.ObjectId() });
      repo.atomicAssign.mockResolvedValue(updated as never);
      const out = await svc.assign(new Types.ObjectId().toString(), new Types.ObjectId().toString());
      expect(out).toBe(updated);
    });
  });

  describe('unassign', () => {
    it('rejects unassigning a delivered order', async () => {
      repo.atomicUnassign.mockResolvedValue(null);
      repo.findById.mockResolvedValue(mockOrder({ status: OrderStatus.DELIVERED }) as never);
      await expect(svc.unassign(new Types.ObjectId().toString())).rejects.toThrow(ConflictException);
    });

    it('rejects unassigning after pickup', async () => {
      repo.atomicUnassign.mockResolvedValue(null);
      repo.findById.mockResolvedValue(mockOrder({ status: OrderStatus.PICKED_UP }) as never);
      await expect(svc.unassign(new Types.ObjectId().toString())).rejects.toThrow(ConflictException);
    });
  });

  describe('updateStatus', () => {
    it('rejects invalid transitions (CREATED → DELIVERED)', async () => {
      repo.findById.mockResolvedValue(mockOrder({ status: OrderStatus.CREATED }) as never);
      await expect(
        svc.updateStatus(new Types.ObjectId().toString(), { status: OrderStatus.DELIVERED }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects any transition out of DELIVERED', async () => {
      repo.findById.mockResolvedValue(mockOrder({ status: OrderStatus.DELIVERED }) as never);
      await expect(
        svc.updateStatus(new Types.ObjectId().toString(), { status: OrderStatus.CANCELLED }),
      ).rejects.toThrow(ConflictException);
    });

    it('succeeds on valid ASSIGNED → PICKED_UP transition', async () => {
      const order = mockOrder({ status: OrderStatus.ASSIGNED });
      repo.findById.mockResolvedValue(order as never);
      repo.atomicTransitionStatus.mockResolvedValue(
        mockOrder({ status: OrderStatus.PICKED_UP }) as never,
      );
      const out = await svc.updateStatus(order._id.toString(), { status: OrderStatus.PICKED_UP });
      expect(out.status).toBe(OrderStatus.PICKED_UP);
    });
  });
});
