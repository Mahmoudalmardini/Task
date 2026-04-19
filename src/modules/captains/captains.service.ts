import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FilterQuery } from 'mongoose';
import { CaptainRepository } from './repositories/captain.repository';
import { CreateCaptainDto } from './dto/create-captain.dto';
import { UpdateCaptainDto } from './dto/update-captain.dto';
import { ListCaptainsDto } from './dto/list-captains.dto';
import { CaptainDocument } from './schemas/captain.schema';
import { CaptainStatus } from '../../common/enums/captain-status.enum';
import {
  buildPaginatedResponse,
  PaginatedResponse,
} from '../../common/dto/paginated-response.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActorType } from '../audit-log/schemas/audit-log.schema';

@Injectable()
export class CaptainsService {
  private readonly logger = new Logger(CaptainsService.name);

  constructor(
    private readonly repo: CaptainRepository,
    private readonly audit: AuditLogService,
  ) {}

  async create(dto: CreateCaptainDto, actorId?: string): Promise<CaptainDocument> {
    const existing = await this.repo.findByPhone(dto.phone);
    if (existing) throw new ConflictException(`Captain with phone ${dto.phone} already exists`);
    const captain = await this.repo.create(dto);
    this.logger.log(`Captain created ${captain._id} (${captain.phone})`);
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: actorId ?? null,
      action: 'captain.create',
      targetType: 'captain',
      targetId: captain._id,
      payload: { phone: captain.phone },
    });
    return captain;
  }

  async findOne(id: string): Promise<CaptainDocument> {
    const c = await this.repo.findById(id);
    if (!c) throw new NotFoundException(`Captain ${id} not found`);
    return c;
  }

  async list(dto: ListCaptainsDto): Promise<PaginatedResponse<CaptainDocument>> {
    const filter: FilterQuery<CaptainDocument> = {};
    if (dto.status) filter.status = dto.status;
    if (dto.availability) filter.availability = dto.availability;
    if (dto.q) {
      filter.$or = [
        { name: { $regex: dto.q, $options: 'i' } },
        { phone: { $regex: dto.q, $options: 'i' } },
      ];
    }
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const { items, total } = await this.repo.list(filter, page, limit);
    return buildPaginatedResponse(items, total, page, limit);
  }

  async update(id: string, dto: UpdateCaptainDto): Promise<CaptainDocument> {
    if (dto.phone) {
      const existing = await this.repo.findByPhone(dto.phone);
      if (existing && existing._id.toString() !== id) {
        throw new ConflictException(`Phone ${dto.phone} is already used by another captain`);
      }
    }
    const updated = await this.repo.update(id, dto);
    if (!updated) throw new NotFoundException(`Captain ${id} not found`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException(`Captain ${id} not found`);
    this.logger.log(`Captain deleted ${id}`);
  }

  async activate(id: string, actorId?: string): Promise<CaptainDocument> {
    const updated = await this.repo.atomicSetStatus(id, CaptainStatus.INACTIVE, CaptainStatus.ACTIVE);
    if (!updated) {
      const exists = await this.repo.findById(id);
      if (!exists) throw new NotFoundException(`Captain ${id} not found`);
      throw new ConflictException(`Captain ${id} is already active`);
    }
    this.logger.log(`Captain ${id} activated`);
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: actorId ?? null,
      action: 'captain.activate',
      targetType: 'captain',
      targetId: updated._id,
    });
    return updated;
  }

  async deactivate(id: string, actorId?: string): Promise<CaptainDocument> {
    const updated = await this.repo.atomicSetStatus(id, CaptainStatus.ACTIVE, CaptainStatus.INACTIVE);
    if (!updated) {
      const exists = await this.repo.findById(id);
      if (!exists) throw new NotFoundException(`Captain ${id} not found`);
      throw new ConflictException(`Captain ${id} is already inactive`);
    }
    this.logger.log(`Captain ${id} deactivated`);
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: actorId ?? null,
      action: 'captain.deactivate',
      targetType: 'captain',
      targetId: updated._id,
    });
    return updated;
  }

  /** Returns true iff the captain exists and is ACTIVE. */
  async isActive(id: string): Promise<boolean> {
    const captain = await this.repo.findById(id);
    return !!captain && captain.status === CaptainStatus.ACTIVE;
  }
}
