import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateResponseDto } from './dto/create-response.dto.js';
import { UpdateResponseDto } from './dto/update-response.dto.js';
import { ResponsesService } from './responses.service.js';

@Controller()
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post('interviews/:interviewId/responses')
  @ProjectAccess('interviewId', 'interview', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('interviewId') interviewId: string, @Body() dto: CreateResponseDto) {
    return this.responsesService.create(interviewId, dto);
  }

  @Get('interviews/:interviewId/responses')
  @ProjectAccess('interviewId', 'interview', ProjectMemberRole.VIEWER)
  findAll(@Param('interviewId') interviewId: string) {
    return this.responsesService.findAll(interviewId);
  }

  @Patch('responses/:id')
  @ProjectAccess('id', 'response', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateResponseDto) {
    return this.responsesService.update(id, dto);
  }

  @Delete('responses/:id')
  @ProjectAccess('id', 'response', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.responsesService.remove(id);
  }
}