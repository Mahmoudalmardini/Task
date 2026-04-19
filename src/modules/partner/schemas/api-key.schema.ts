import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ApiKeyDocument = HydratedDocument<ApiKey>;

@Schema({ timestamps: true, collection: 'api_keys' })
export class ApiKey {
  @Prop({ required: true, trim: true })
  name!: string;

  /** Short human-readable prefix (first 8 chars of the raw key). Used for fast lookup. */
  @Prop({ required: true, unique: true })
  prefix!: string;

  /** bcrypt hash of the raw key. */
  @Prop({ required: true })
  hashedKey!: string;

  @Prop({ default: true })
  active!: boolean;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
