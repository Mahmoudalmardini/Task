import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { OrdersModule } from '../orders/orders.module';
import { ApiKey, ApiKeySchema } from './schemas/api-key.schema';
import {
  IdempotencyRecord,
  IdempotencyRecordSchema,
} from './schemas/idempotency.schema';
import { PartnerService } from './partner.service';
import { PartnerController } from './partner.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ApiKeyThrottlerGuard } from './guards/api-key-throttler.guard';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApiKey.name, schema: ApiKeySchema },
      { name: IdempotencyRecord.name, schema: IdempotencyRecordSchema },
    ]),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: (config.get<number>('partner.rateLimitTtlSeconds') ?? 60) * 1000,
          limit: config.get<number>('partner.rateLimitMax') ?? 60,
        },
      ],
    }),
    OrdersModule,
  ],
  controllers: [PartnerController],
  providers: [PartnerService, ApiKeyGuard, ApiKeyThrottlerGuard, IdempotencyInterceptor],
  exports: [ApiKeyGuard],
})
export class PartnerModule {}
