import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

export enum AuditActorType {
  ADMIN = 'admin',
  CAPTAIN = 'captain',
  PARTNER = 'partner',
  SYSTEM = 'system',
}

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ required: true, enum: Object.values(AuditActorType) })
  actorType!: AuditActorType;

  @Prop({ type: String, default: null })
  actorId!: string | null;

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  targetType!: string;

  @Prop({ type: Types.ObjectId, required: true })
  targetId!: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  payload!: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ targetType: 1, targetId: 1 });
AuditLogSchema.index({ createdAt: -1 });
