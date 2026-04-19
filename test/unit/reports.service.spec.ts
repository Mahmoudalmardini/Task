import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { ReportsService } from '../../src/modules/reports/reports.service';
import { Order } from '../../src/modules/orders/schemas/order.schema';

function makeQuery(overrides = {}) {
  return {
    previousFrom: new Date('2024-01-01'),
    previousTo: new Date('2024-01-31'),
    currentFrom: new Date('2024-02-01'),
    currentTo: new Date('2024-02-28'),
    page: 1,
    limit: 20,
    ...overrides,
  };
}

describe('ReportsService', () => {
  let svc: ReportsService;
  let aggregateMock: jest.Mock;

  beforeEach(async () => {
    aggregateMock = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getModelToken(Order.name),
          useValue: { aggregate: aggregateMock },
        },
      ],
    }).compile();
    svc = module.get(ReportsService);
  });

  it('returns paginated data with correct drop math', async () => {
    aggregateMock.mockResolvedValue([
      {
        data: [
          {
            captainId: '507f1f77bcf86cd799439011',
            captainName: 'Test Captain',
            previousOrders: 10,
            currentOrders: 6,
            dropCount: 4,
            dropPercentage: 40.0,
          },
        ],
        totalArr: [{ total: 1 }],
      },
    ]);
    const result = await svc.orderVolumeDrop(makeQuery());
    expect(result.data[0].dropCount).toBe(4);
    expect(result.data[0].dropPercentage).toBe(40.0);
    expect(result.meta).toMatchObject({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('returns empty data when no captains have a drop', async () => {
    aggregateMock.mockResolvedValue([{ data: [], totalArr: [] }]);
    const result = await svc.orderVolumeDrop(makeQuery());
    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });

  it('throws BadRequestException when previousFrom > previousTo', async () => {
    await expect(
      svc.orderVolumeDrop(
        makeQuery({ previousFrom: new Date('2024-01-31'), previousTo: new Date('2024-01-01') }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when currentFrom > currentTo', async () => {
    await expect(
      svc.orderVolumeDrop(
        makeQuery({ currentFrom: new Date('2024-02-28'), currentTo: new Date('2024-02-01') }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when previous window overlaps current window', async () => {
    await expect(
      svc.orderVolumeDrop(
        makeQuery({ previousTo: new Date('2024-02-10') }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('handles aggregate returning undefined gracefully', async () => {
    aggregateMock.mockResolvedValue([undefined]);
    const result = await svc.orderVolumeDrop(makeQuery());
    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });
});
