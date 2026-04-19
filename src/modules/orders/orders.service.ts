import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FilterQuery, SortOrder as MongoSortOrder, Types } from 'mongoose';
import { OrderRepository } from './repositories/order.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-status.dto';
import {
  AssignmentState,
  ListOrdersDto,
  OrderSortBy,
  SortOrder,
} from './dto/list-orders.dto';
import { OrderDocument } from './schemas/order.schema';
import { OrderStatus } from '../../common/enums/order-status.enum';
import {
  buildPaginatedResponse,
  PaginatedResponse,
} from '../../common/dto/paginated-response.dto';
import { canTransition, isTerminal } from '../../common/utils/status-fsm';
import { CaptainsService } from '../captains/captains.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActorType } from '../audit-log/schemas/audit-log.schema';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly repo: OrderRepository,
    private readonly captains: CaptainsService,
    private readonly audit: AuditLogService,
  ) {}

  async create(dto: CreateOrderDto, actorType: AuditActorType, actorId?: string): Promise<OrderDocument> {
    const order = await this.repo.create(dto).catch((err: Error & { code?: number }) => {
      if (err.code === 11000) {
        throw new ConflictException(
          `Order with same orderNumber or externalReference already exists`,
        );
      }
      throw err;
    });
    this.logger.log(`Order created ${order._id} (${order.orderNumber})`);
    await this.audit.record({
      actorType,
      actorId: actorId ?? null,
      action: 'order.create',
      targetType: 'order',
      targetId: order._id,
      payload: { orderNumber: order.orderNumber, externalReference: order.externalReference },
    });
    return order;
  }

  async findOne(id: string): Promise<OrderDocument> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  async list(dto: ListOrdersDto): Promise<PaginatedResponse<OrderDocument>> {
    const filter = this.buildListFilter(dto);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const sortOrder: MongoSortOrder = dto.sortOrder === SortOrder.ASC ? 1 : -1;
    const sort: Record<string, MongoSortOrder> = {
      [dto.sortBy ?? OrderSortBy.CREATED_AT]: sortOrder,
    };
    let projection: Record<string, number> | null = null;

    if (dto.q) {
      filter.$text = { $search: dto.q };
      projection = { score: { $meta: 'textScore' } } as unknown as Record<string, number>;
      (sort as Record<string, unknown>).score = { $meta: 'textScore' };
    }

    const { items, total } = await this.repo.list(filter, sort, projection, page, limit);
    return buildPaginatedResponse(items, total, page, limit);
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderDocument> {
    const existing = await this.findOne(id);
    if (isTerminal(existing.status)) {
      throw new ConflictException(
        `Order ${id} is in terminal status ${existing.status} and cannot be modified`,
      );
    }
    const updated = await this.repo.update(id, dto);
    if (!updated) throw new NotFoundException(`Order ${id} not found`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findOne(id);
    if (
      existing.status !== OrderStatus.CREATED &&
      existing.status !== OrderStatus.CANCELLED
    ) {
      throw new ConflictException(
        `Order in status ${existing.status} cannot be deleted — cancel it first`,
      );
    }
    await this.repo.delete(id);
    this.logger.log(`Order deleted ${id}`);
  }

  async assign(orderId: string, captainId: string, actorId?: string): Promise<OrderDocument> {
    const captainActive = await this.captains.isActive(captainId);
    if (!captainActive) {
      throw new ConflictException(
        `Captain ${captainId} is inactive or does not exist and cannot be assigned`,
      );
    }
    const updated = await this.repo.atomicAssign(orderId, captainId);
    if (!updated) {
      const existing = await this.repo.findById(orderId);
      if (!existing) throw new NotFoundException(`Order ${orderId} not found`);
      throw new ConflictException(
        `Order in status ${existing.status}${existing.captainId ? ' (already assigned)' : ''} cannot be assigned`,
      );
    }
    this.logger.log(`Order ${orderId} assigned to captain ${captainId}`);
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: actorId ?? null,
      action: 'order.assign',
      targetType: 'order',
      targetId: updated._id,
      payload: { captainId },
    });
    return updated;
  }

  async unassign(orderId: string, actorId?: string): Promise<OrderDocument> {
    const updated = await this.repo.atomicUnassign(orderId);
    if (!updated) {
      const existing = await this.repo.findById(orderId);
      if (!existing) throw new NotFoundException(`Order ${orderId} not found`);
      throw new ConflictException(
        `Order in status ${existing.status} cannot be unassigned`,
      );
    }
    this.logger.log(`Order ${orderId} unassigned`);
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: actorId ?? null,
      action: 'order.unassign',
      targetType: 'order',
      targetId: updated._id,
    });
    return updated;
  }

  async updateStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
    actorId?: string,
  ): Promise<OrderDocument> {
    const existing = await this.findOne(orderId);
    if (!canTransition(existing.status, dto.status)) {
      throw new ConflictException(
        `Invalid status transition: ${existing.status} → ${dto.status}`,
      );
    }
    const updated = await this.repo.atomicTransitionStatus(orderId, existing.status, dto.status);
    if (!updated) {
      throw new ConflictException(
        `Order status changed concurrently; please retry (expected ${existing.status})`,
      );
    }
    this.logger.log(`Order ${orderId} status ${existing.status} → ${dto.status}`);
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: actorId ?? null,
      action: 'order.status',
      targetType: 'order',
      targetId: updated._id,
      payload: { from: existing.status, to: dto.status },
    });
    return updated;
  }

  /** Returns order IDs currently in ASSIGNED/PICKED_UP for a captain — used by socket broadcast. */
  async activeOrderIdsForCaptain(captainId: string): Promise<string[]> {
    const orders = await this.repo.findActiveOrdersForCaptain(captainId);
    return orders.map((o) => o._id.toString());
  }

  private buildListFilter(dto: ListOrdersDto): FilterQuery<OrderDocument> {
    const filter: FilterQuery<OrderDocument> = {};
    if (dto.status) filter.status = dto.status;
    if (dto.region) filter.region = dto.region;
    if (dto.captainId) filter.captainId = new Types.ObjectId(dto.captainId);
    if (dto.assignmentState === AssignmentState.ASSIGNED) filter.captainId = { $ne: null };
    if (dto.assignmentState === AssignmentState.UNASSIGNED) filter.captainId = null;
    if (dto.from || dto.to) {
      filter.createdAt = {};
      if (dto.from) (filter.createdAt as Record<string, Date>).$gte = dto.from;
      if (dto.to) (filter.createdAt as Record<string, Date>).$lte = dto.to;
    }
    return filter;
  }
}
