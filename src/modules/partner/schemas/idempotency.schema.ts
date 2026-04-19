import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type IdempotencyRecordDocument = HydratedDocument<IdempotencyRecord>;

@Schema({ timestamps: true, collection: 'idempotency_records' })
export class IdempotencyRecord {
  /** `${apiKeyId}:${rawKey}` — unique per (caller, idempotency-key). */
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop({ type: Types.ObjectId, required: true })
  apiKeyId!: Types.ObjectId;

  /** sha256 of the request body, to detect key reuse with a different payload. */
  @Prop({ required: true })
  requestHash!: string;

  @Prop({ required: true })
  responseStatus!: number;

  @Prop({ type: Object, default: {} })
  responseBody!: Record<string, unknown>;

  /** Auto-removed by TTL index. */
  @Prop({ required: true })
  expiresAt!: Date;
}

export const IdempotencyRecordSchema = SchemaFactory.createForClass(IdempotencyRecord);
IdempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
