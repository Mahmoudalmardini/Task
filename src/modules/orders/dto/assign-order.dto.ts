import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class AssignOrderDto {
  @ApiProperty({ example: '65f0c1b4a2d1e4a3b3f8e9a1' })
  @IsMongoId()
  captainId!: string;
}
