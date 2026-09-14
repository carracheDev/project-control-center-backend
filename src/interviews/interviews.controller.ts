import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateInterviewDto } from './dto/create-interview.dto.js';
import { UpdateInterviewDto } from './dto/update-interview.dto.js';
import { InterviewsService } from './interviews.service.js';

@Controller()
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post('phases/:phaseId/interviews')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('phaseId') phaseId: string, @Body() dto: CreateInterviewDto) {
    return this.interviewsService.create(phaseId, dto);
  }

  @Get('phases/:phaseId/interviews')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  findAll(@Param('phaseId') phaseId: string) {
    return this.interviewsService.findAll(phaseId);
  }

  @Get('interviews/:id')
  @ProjectAccess('id', 'interview', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.interviewsService.findOne(id);
  }

  @Patch('interviews/:id')
  @ProjectAccess('id', 'interview', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateInterviewDto) {
    return this.interviewsService.update(id, dto);
  }

  @Delete('interviews/:id')
  @ProjectAccess('id', 'interview', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.interviewsService.remove(id);
  }
}