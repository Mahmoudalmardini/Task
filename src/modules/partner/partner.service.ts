import { Injectable, Logger } from '@nestjs/common';
import { CreatePartnerOrderDto } from './dto/create-partner-order.dto';
import { OrdersService } from '../orders/orders.service';
import { AuditActorType } from '../audit-log/schemas/audit-log.schema';
import { OrderDocument } from '../orders/schemas/order.schema';

function generateOrderNumber(prefix = 'PRT'): string {
  const now = new Date();
  const ymd = `${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, '0')}${now.getUTCDate().toString().padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${ymd}-${rand}`;
}

@Injectable()
export class PartnerService {
  private readonly logger = new Logger(PartnerService.name);

  constructor(private readonly orders: OrdersService) {}

  async createOrder(
    dto: CreatePartnerOrderDto,
    apiKey: { id: string; name: string },
  ): Promise<OrderDocument> {
    this.logger.log(
      `Partner ${apiKey.name} creating order (externalRef=${dto.externalReference ?? 'none'})`,
    );
    return this.orders.create(
      { ...dto, orderNumber: generateOrderNumber() },
      AuditActorType.PARTNER,
      apiKey.id,
    );
  }
}
