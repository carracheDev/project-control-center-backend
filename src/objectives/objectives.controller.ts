import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateObjectiveDto } from './dto/create-objective.dto.js';
import { UpdateObjectiveDto } from './dto/update-objective.dto.js';
import { ObjectivesService } from './objectives.service.js';

@Controller()
export class ObjectivesController {
  constructor(private readonly objectivesService: ObjectivesService) {}

  @Post('phases/:phaseId/objectives')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('phaseId') phaseId: string, @Body() dto: CreateObjectiveDto) {
    return this.objectivesService.create(phaseId, dto);
  }

  @Get('phases/:phaseId/objectives')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  findAll(@Param('phaseId') phaseId: string) {
    return this.objectivesService.findAll(phaseId);
  }

  @Get('objectives/:id')
  @ProjectAccess('id', 'objective', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.objectivesService.findOne(id);
  }

  @Patch('objectives/:id')
  @ProjectAccess('id', 'objective', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateObjectiveDto) {
    return this.objectivesService.update(id, dto);
  }

  @Delete('objectives/:id')
  @ProjectAccess('id', 'objective', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.objectivesService.remove(id);
  }
}