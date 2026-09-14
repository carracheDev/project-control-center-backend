import { Module } from '@nestjs/common';
import { CoverageModule } from '../coverage/coverage.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { GatingController } from './gating.controller.js';
import { GatingService } from './gating.service.js';

@Module({
  imports: [PrismaModule, CoverageModule],
  controllers: [GatingController],
  providers: [GatingService],
  exports: [GatingService],
})
export class GatingModule {}