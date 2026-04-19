import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  CaptainAvailability,
  CaptainStatus,
} from '../../../common/enums/captain-status.enum';

export type CaptainDocument = HydratedDocument<Captain>;

@Schema({ _id: false })
export class CaptainLocation {
  @Prop({ required: true, min: -90, max: 90 })
  lat!: number;

  @Prop({ required: true, min: -180, max: 180 })
  lng!: number;

  @Prop({ required: true })
  updatedAt!: Date;
}

const CaptainLocationSchema = SchemaFactory.createForClass(CaptainLocation);

@Schema({ timestamps: true, collection: 'captains' })
export class Captain {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, trim: true })
  phone!: string;

  @Prop({ required: true, trim: true })
  vehicleType!: string;

  @Prop({ required: true, enum: Object.values(CaptainStatus), default: CaptainStatus.ACTIVE })
  status!: CaptainStatus;

  @Prop({
    required: true,
    enum: Object.values(CaptainAvailability),
    default: CaptainAvailability.OFFLINE,
  })
  availability!: CaptainAvailability;

  @Prop({ type: CaptainLocationSchema, default: null })
  currentLocation!: CaptainLocation | null;
}

export const CaptainSchema = SchemaFactory.createForClass(Captain);
CaptainSchema.index({ status: 1 });
