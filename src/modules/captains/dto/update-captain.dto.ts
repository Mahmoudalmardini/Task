import { PartialType } from '@nestjs/swagger';
import { CreateCaptainDto } from './create-captain.dto';

export class UpdateCaptainDto extends PartialType(CreateCaptainDto) {}
