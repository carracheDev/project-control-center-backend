import { Controller, Get, Param } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { GatingService } from './gating.service.js';

@Controller()
export class GatingController {
  constructor(private readonly gatingService: GatingService) {}

  @Get('phases/:phaseId/gating')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  calculate(@Param('phaseId') phaseId: string) {
    return this.gatingService.calculate(phaseId);
  }
}