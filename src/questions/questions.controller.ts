import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateOptionDto } from './dto/create-option.dto.js';
import { CreateQuestionDto } from './dto/create-question.dto.js';
import { UpdateOptionDto } from './dto/update-option.dto.js';
import { UpdateQuestionDto } from './dto/update-question.dto.js';
import { QuestionsService } from './questions.service.js';

@Controller()
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post('questionnaires/:questionnaireId/questions')
  @ProjectAccess('questionnaireId', 'questionnaire', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('questionnaireId') questionnaireId: string, @Body() dto: CreateQuestionDto) {
    return this.questionsService.create(questionnaireId, dto);
  }

  @Get('questionnaires/:questionnaireId/questions')
  @ProjectAccess('questionnaireId', 'questionnaire', ProjectMemberRole.VIEWER)
  findAll(@Param('questionnaireId') questionnaireId: string) {
    return this.questionsService.findAll(questionnaireId);
  }

  @Get('questions/:id')
  @ProjectAccess('id', 'question', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }

  @Patch('questions/:id')
  @ProjectAccess('id', 'question', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.questionsService.update(id, dto);
  }

  @Delete('questions/:id')
  @ProjectAccess('id', 'question', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.questionsService.remove(id);
  }

  @Post('questions/:questionId/options')
  @ProjectAccess('questionId', 'question', ProjectMemberRole.PROJECT_MANAGER)
  createOption(@Param('questionId') questionId: string, @Body() dto: CreateOptionDto) {
    return this.questionsService.createOption(questionId, dto);
  }

  @Get('questions/:questionId/options')
  @ProjectAccess('questionId', 'question', ProjectMemberRole.VIEWER)
  findOptions(@Param('questionId') questionId: string) {
    return this.questionsService.findOptions(questionId);
  }

  @Patch('options/:id')
  @ProjectAccess('id', 'option', ProjectMemberRole.PROJECT_MANAGER)
  updateOption(@Param('id') id: string, @Body() dto: UpdateOptionDto) {
    return this.questionsService.updateOption(id, dto);
  }

  @Delete('options/:id')
  @ProjectAccess('id', 'option', ProjectMemberRole.PROJECT_MANAGER)
  removeOption(@Param('id') id: string) {
    return this.questionsService.removeOption(id);
  }
}