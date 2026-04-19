import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditActorType, AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface AuditLogInput {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string | Types.ObjectId;
  payload?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>,
  ) {}

  async record(input: AuditLogInput): Promise<void> {
    try {
      await this.model.create({
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId:
          typeof input.targetId === 'string' ? new Types.ObjectId(input.targetId) : input.targetId,
        payload: input.payload ?? {},
      });
    } catch (err) {
      this.logger.error(`Failed to record audit log: ${(err as Error).message}`);
    }
  }
}
