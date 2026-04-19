import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { OrderVolumeDropQueryDto } from './dto/order-volume-drop.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Reports')
@ApiBearerAuth('admin-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('captains/order-volume-drop')
  @ApiOperation({
    summary: 'Captains with decreased order volume',
    description:
      'Compares assigned order counts between two non-overlapping periods. Returns captains whose counts dropped, with percentage and count deltas, filtered/sorted/paginated.',
  })
  @ApiResponse({ status: 200, description: 'Paginated report list' })
  orderVolumeDrop(@Query() q: OrderVolumeDropQueryDto) {
    return this.reports.orderVolumeDrop(q);
  }
}
