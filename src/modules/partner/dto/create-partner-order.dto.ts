import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OrderLocationDto } from '../../orders/dto/create-order.dto';

export class CreatePartnerOrderDto {
  @ApiProperty({ example: 'Sara Ahmad' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  customerName!: string;

  @ApiProperty({ example: '+962799999999' })
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'customerPhone must be in E.164 format' })
  customerPhone!: string;

  @ApiProperty({ example: 'Amman - Sweifieh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  region!: string;

  @ApiProperty({ example: 'Al-Wakalat Street, near Cozmo, Amman' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  fullAddress!: string;

  @ApiProperty({ type: OrderLocationDto })
  @ValidateNested()
  @Type(() => OrderLocationDto)
  location!: OrderLocationDto;

  @ApiPropertyOptional({
    description: 'Partner system identifier — unique across the platform.',
    example: 'PARTNER-ORDER-2026-042',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalReference?: string;
}
