import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateQuestionnaireDto } from './dto/create-questionnaire.dto.js';
import { UpdateQuestionnaireDto } from './dto/update-questionnaire.dto.js';
import { QuestionnairesService } from './questionnaires.service.js';

@Controller()
export class QuestionnairesController {
  constructor(private readonly questionnairesService: QuestionnairesService) {}

  @Post('phases/:phaseId/questionnaires')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('phaseId') phaseId: string, @Body() dto: CreateQuestionnaireDto) {
    return this.questionnairesService.create(phaseId, dto);
  }

  @Get('phases/:phaseId/questionnaires')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  findAll(@Param('phaseId') phaseId: string) {
    return this.questionnairesService.findAll(phaseId);
  }

  @Get('questionnaires/:id')
  @ProjectAccess('id', 'questionnaire', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.questionnairesService.findOne(id);
  }

  @Patch('questionnaires/:id')
  @ProjectAccess('id', 'questionnaire', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateQuestionnaireDto) {
    return this.questionnairesService.update(id, dto);
  }

  @Delete('questionnaires/:id')
  @ProjectAccess('id', 'questionnaire', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.questionnairesService.remove(id);
  }
}