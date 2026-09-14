import { Module } from '@nestjs/common';
import { CoverageModule } from '../coverage/coverage.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ReadinessController } from './readiness.controller.js';
import { ReadinessService } from './readiness.service.js';

@Module({
  imports: [PrismaModule, CoverageModule],
  controllers: [ReadinessController],
  providers: [ReadinessService],
})
export class ReadinessModule {}