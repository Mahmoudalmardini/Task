import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  CaptainAvailability,
  CaptainStatus,
} from '../../../common/enums/captain-status.enum';

export class ListCaptainsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CaptainStatus })
  @IsOptional()
  @IsEnum(CaptainStatus)
  status?: CaptainStatus;

  @ApiPropertyOptional({ enum: CaptainAvailability })
  @IsOptional()
  @IsEnum(CaptainAvailability)
  availability?: CaptainAvailability;

  @ApiPropertyOptional({ description: 'Search by name or phone' })
  @IsOptional()
  @IsString()
  q?: string;
}
