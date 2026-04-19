import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class OrderLocationDto {
  @ApiProperty({ example: 31.9539 })
  @IsLatitude()
  @Type(() => Number)
  lat!: number;

  @ApiProperty({ example: 35.9106 })
  @IsLongitude()
  @Type(() => Number)
  lng!: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'ORD-2026-0001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  orderNumber!: string;

  @ApiProperty({ example: 'Layla Hassan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  customerName!: string;

  @ApiProperty({ example: '+962790000000' })
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'customerPhone must be in E.164 format' })
  customerPhone!: string;

  @ApiProperty({ example: 'Amman - Abdali' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  region!: string;

  @ApiProperty({ example: 'Building 14, 3rd floor, Abdali Boulevard, Amman' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  fullAddress!: string;

  @ApiProperty({ type: OrderLocationDto })
  @ValidateNested()
  @Type(() => OrderLocationDto)
  location!: OrderLocationDto;

  @ApiPropertyOptional({
    description: 'Partner system identifier (optional, unique when present)',
    example: 'PARTNER-REF-42',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalReference?: string;
}
