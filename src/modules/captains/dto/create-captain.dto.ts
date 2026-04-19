import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  CaptainAvailability,
  CaptainStatus,
} from '../../../common/enums/captain-status.enum';

export class CreateCaptainDto {
  @ApiProperty({ example: 'Ahmad Khaled' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '+962791234567', description: 'E.164 formatted phone number' })
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be in E.164 format (e.g. +962791234567)' })
  phone!: string;

  @ApiProperty({ example: 'motorcycle' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  vehicleType!: string;

  @ApiPropertyOptional({ enum: CaptainStatus, example: CaptainStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CaptainStatus)
  status?: CaptainStatus;

  @ApiPropertyOptional({ enum: CaptainAvailability, example: CaptainAvailability.OFFLINE })
  @IsOptional()
  @IsEnum(CaptainAvailability)
  availability?: CaptainAvailability;
}
