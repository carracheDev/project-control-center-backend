import { Controller, Get, Param } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { ReadinessService } from './readiness.service.js';

@Controller()
export class ReadinessController {
  constructor(private readonly readinessService: ReadinessService) {}

  @Get('phases/:phaseId/readiness')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  calculate(@Param('phaseId') phaseId: string) {
    return this.readinessService.calculate(phaseId);
  }
}