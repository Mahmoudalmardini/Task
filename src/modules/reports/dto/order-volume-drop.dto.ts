import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export enum DropSortBy {
  DROP_PERCENTAGE = 'dropPercentage',
  DROP_COUNT = 'dropCount',
  PREVIOUS_ORDERS = 'previousOrders',
  CURRENT_ORDERS = 'currentOrders',
}

export enum DropSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class OrderVolumeDropQueryDto extends PaginationDto {
  @ApiProperty({ description: 'ISO date — start of previous period', example: '2026-01-01T00:00:00Z' })
  @Type(() => Date)
  @IsDate()
  previousFrom!: Date;

  @ApiProperty({ description: 'ISO date — end of previous period', example: '2026-02-28T23:59:59Z' })
  @Type(() => Date)
  @IsDate()
  previousTo!: Date;

  @ApiProperty({ description: 'ISO date — start of current period', example: '2026-03-01T00:00:00Z' })
  @Type(() => Date)
  @IsDate()
  currentFrom!: Date;

  @ApiProperty({ description: 'ISO date — end of current period', example: '2026-04-30T23:59:59Z' })
  @Type(() => Date)
  @IsDate()
  currentTo!: Date;

  @ApiPropertyOptional({ description: 'Minimum orders in previous period', example: 5, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPreviousOrders?: number = 1;

  @ApiPropertyOptional({
    description: 'Minimum drop percentage (0-100) to include a captain',
    example: 20,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minDropPercentage?: number = 0;

  @ApiPropertyOptional({ enum: DropSortBy, default: DropSortBy.DROP_PERCENTAGE })
  @IsOptional()
  @IsEnum(DropSortBy)
  sortBy?: DropSortBy = DropSortBy.DROP_PERCENTAGE;

  @ApiPropertyOptional({ enum: DropSortOrder, default: DropSortOrder.DESC })
  @IsOptional()
  @IsEnum(DropSortOrder)
  sortOrder?: DropSortOrder = DropSortOrder.DESC;
}

export class OrderVolumeDropItemDto {
  @ApiProperty() captainId!: string;
  @ApiProperty() captainName!: string;
  @ApiProperty({ example: 20 }) previousOrders!: number;
  @ApiProperty({ example: 8 }) currentOrders!: number;
  @ApiProperty({ example: 12 }) dropCount!: number;
  @ApiProperty({ example: 60 }) dropPercentage!: number;
}
