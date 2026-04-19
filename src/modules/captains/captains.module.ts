import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Captain, CaptainSchema } from './schemas/captain.schema';
import { CaptainRepository } from './repositories/captain.repository';
import { CaptainsService } from './captains.service';
import { CaptainsController } from './captains.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Captain.name, schema: CaptainSchema }]),
    AuthModule,
  ],
  controllers: [CaptainsController],
  providers: [CaptainRepository, CaptainsService],
  exports: [CaptainsService, CaptainRepository],
})
export class CaptainsModule {}
