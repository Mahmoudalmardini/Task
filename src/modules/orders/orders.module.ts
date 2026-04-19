import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CaptainsModule } from '../captains/captains.module';
import { Order, OrderSchema } from './schemas/order.schema';
import { OrderRepository } from './repositories/order.repository';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    AuthModule,
    CaptainsModule,
  ],
  controllers: [OrdersController],
  providers: [OrderRepository, OrdersService],
  exports: [OrdersService, OrderRepository, MongooseModule],
})
export class OrdersModule {}
