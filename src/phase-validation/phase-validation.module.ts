import { Module } from '@nestjs/common';
import { GatingModule } from '../gating/gating.module.js';
import { PhasesModule } from '../phases/phases.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PhaseValidationController } from './phase-validation.controller.js';
import { PhaseValidationService } from './phase-validation.service.js';

@Module({
  imports: [PrismaModule, GatingModule, PhasesModule],
  controllers: [PhaseValidationController],
  providers: [PhaseValidationService],
})
export class PhaseValidationModule {}