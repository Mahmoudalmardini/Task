import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LocationHistoryDocument = HydratedDocument<LocationHistory>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'location_history' })
export class LocationHistory {
  @Prop({ type: Types.ObjectId, ref: 'Captain', required: true })
  captainId!: Types.ObjectId;

  @Prop({ required: true, min: -90, max: 90 })
  lat!: number;

  @Prop({ required: true, min: -180, max: 180 })
  lng!: number;

  @Prop({ required: true })
  recordedAt!: Date;
}

export const LocationHistorySchema = SchemaFactory.createForClass(LocationHistory);
LocationHistorySchema.index({ captainId: 1, recordedAt: -1 });
