import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CaptainsModule } from '../captains/captains.module';
import { OrdersModule } from '../orders/orders.module';
import {
  LocationHistory,
  LocationHistorySchema,
} from './schemas/location-history.schema';
import { LocationsService } from './locations.service';
import { LocationsGateway } from './locations.gateway';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: LocationHistory.name, schema: LocationHistorySchema }]),
    AuthModule,
    CaptainsModule,
    OrdersModule,
  ],
  providers: [LocationsService, LocationsGateway],
  exports: [LocationsService],
})
export class LocationsModule {}
