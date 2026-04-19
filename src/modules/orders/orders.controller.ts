import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { AssignOrderDto } from './dto/assign-order.dto';
import { UpdateOrderStatusDto } from './dto/update-status.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { AuditActorType } from '../audit-log/schemas/audit-log.schema';

@ApiTags('Orders')
@ApiBearerAuth('admin-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('orders')
export class OrdersController {
  constructor(private readonly svc: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create an order (admin)' })
  @ApiResponse({ status: 201, description: 'Order created' })
  @ApiResponse({ status: 409, description: 'orderNumber or externalReference already exists' })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, AuditActorType.ADMIN, user.sub);
  }

  @Get()
  @ApiOperation({
    summary: 'List orders with filtering, search, sort, and pagination',
    description:
      'Supports: filter (status, region, captainId, date range, assignmentState), search (text on orderNumber/customerName/customerPhone), sort (createdAt/updatedAt/status), pagination (page, limit).',
  })
  list(@Query() dto: ListOrdersDto) {
    return this.svc.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one order — includes full location/address' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update order fields (non-terminal statuses only)' })
  @ApiResponse({ status: 409, description: 'Order is in a terminal status' })
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateOrderDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete order (only if CREATED or CANCELLED)' })
  async delete(@Param('id', ParseObjectIdPipe) id: string): Promise<void> {
    await this.svc.delete(id);
  }

  @Post(':id/assign')
  @ApiOperation({
    summary: 'Assign a captain to an order',
    description:
      'Atomic: only succeeds when order is CREATED & unassigned AND captain is ACTIVE. 409 on any other state.',
  })
  @ApiResponse({ status: 409, description: 'Order not assignable or captain inactive' })
  assign(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AssignOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.assign(id, dto.captainId, user.sub);
  }

  @Post(':id/unassign')
  @ApiOperation({
    summary: 'Unassign captain from an order',
    description: 'Only allowed when order is in ASSIGNED status (before pickup).',
  })
  unassign(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.unassign(id, user.sub);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Transition order status (FSM-enforced)',
    description:
      'Valid: CREATED→ASSIGNED|CANCELLED, ASSIGNED→PICKED_UP|CANCELLED|CREATED, PICKED_UP→DELIVERED|CANCELLED. DELIVERED & CANCELLED are terminal.',
  })
  @ApiResponse({ status: 409, description: 'Invalid transition or concurrent change' })
  updateStatus(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateStatus(id, dto, user.sub);
  }
}
