import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { PartnerService } from './partner.service';
import { CreatePartnerOrderDto } from './dto/create-partner-order.dto';
import { API_KEY_REQUEST_PROP, ApiKeyGuard } from './guards/api-key.guard';
import { ApiKeyThrottlerGuard } from './guards/api-key-throttler.guard';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';

@ApiTags('Partner')
@ApiSecurity('partner-api-key')
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
@Controller('partner')
export class PartnerController {
  constructor(private readonly svc: PartnerService) {}

  @Post('orders')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Create an order via partner API',
    description:
      'Requires `X-API-Key` header. Supports `Idempotency-Key` (24h TTL). Rate-limited to 60 requests/minute per API key.',
  })
  @ApiHeader({ name: 'X-API-Key', required: true, description: 'Partner API key' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Replay-safe key. Re-sending the same key with the same body replays the cached response; with a different body, returns 409.',
  })
  @ApiResponse({ status: 201, description: 'Order created' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 409, description: 'externalReference conflict or idempotency mismatch' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async createOrder(@Req() req: Request, @Body() dto: CreatePartnerOrderDto) {
    const apiKey = (req as unknown as Record<string, unknown>)[API_KEY_REQUEST_PROP] as {
      id: string;
      name: string;
    };
    return this.svc.createOrder(dto, apiKey);
  }
}
