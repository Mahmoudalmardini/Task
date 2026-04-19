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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CaptainsService } from './captains.service';
import { CreateCaptainDto } from './dto/create-captain.dto';
import { UpdateCaptainDto } from './dto/update-captain.dto';
import { ListCaptainsDto } from './dto/list-captains.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Captains')
@ApiBearerAuth('admin-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('captains')
export class CaptainsController {
  constructor(private readonly svc: CaptainsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a captain' })
  @ApiResponse({ status: 201, description: 'Captain created' })
  @ApiResponse({ status: 409, description: 'Phone already in use' })
  create(@Body() dto: CreateCaptainDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'List captains with filters and pagination' })
  list(@Query() dto: ListCaptainsDto) {
    return this.svc.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one captain by id' })
  @ApiResponse({ status: 404, description: 'Captain not found' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a captain' })
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateCaptainDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a captain' })
  @ApiResponse({ status: 204, description: 'Captain deleted' })
  async delete(@Param('id', ParseObjectIdPipe) id: string): Promise<void> {
    await this.svc.delete(id);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate a captain' })
  @ApiResponse({ status: 409, description: 'Captain is already active' })
  activate(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.activate(id, user.sub);
  }

  @Post(':id/deactivate')
  @ApiOperation({
    summary: 'Deactivate a captain',
    description:
      'Deactivating a captain with in-flight orders is allowed (audited). Inactive captains cannot be assigned and cannot send location updates.',
  })
  @ApiResponse({ status: 409, description: 'Captain is already inactive' })
  deactivate(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.deactivate(id, user.sub);
  }
}
