import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { OrderStatus } from '../../../common/enums/order-status.enum';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ _id: false })
export class OrderLocation {
  @Prop({ required: true, min: -90, max: 90 })
  lat!: number;

  @Prop({ required: true, min: -180, max: 180 })
  lng!: number;
}

const OrderLocationSchema = SchemaFactory.createForClass(OrderLocation);

@Schema({ timestamps: true, collection: 'orders' })
export class Order {
  @Prop({ required: true, unique: true, trim: true })
  orderNumber!: string;

  @Prop({ required: true, trim: true })
  customerName!: string;

  @Prop({ required: true, trim: true })
  customerPhone!: string;

  @Prop({ required: true, trim: true })
  region!: string;

  @Prop({ required: true, trim: true })
  fullAddress!: string;

  @Prop({ type: OrderLocationSchema, required: true })
  location!: OrderLocation;

  @Prop({ required: true, enum: Object.values(OrderStatus), default: OrderStatus.CREATED })
  status!: OrderStatus;

  @Prop({ type: Types.ObjectId, ref: 'Captain', default: null })
  captainId!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  externalReference!: string | null;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ captainId: 1, createdAt: -1 });
OrderSchema.index({ region: 1 });
OrderSchema.index({ externalReference: 1 }, { unique: true, sparse: true });
OrderSchema.index(
  { orderNumber: 'text', customerName: 'text', customerPhone: 'text' },
  { name: 'OrderTextIndex', weights: { orderNumber: 10, customerPhone: 5, customerName: 3 } },
);
