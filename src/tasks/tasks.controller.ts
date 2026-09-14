import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { TasksService } from './tasks.service.js';

@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('phases/:phaseId/tasks')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('phaseId') phaseId: string, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(phaseId, dto);
  }

  @Get('phases/:phaseId/tasks')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  findAll(@Param('phaseId') phaseId: string) {
    return this.tasksService.findAll(phaseId);
  }

  @Get('tasks/:id')
  @ProjectAccess('id', 'task', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Patch('tasks/:id')
  @ProjectAccess('id', 'task', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  @Delete('tasks/:id')
  @ProjectAccess('id', 'task', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }
}