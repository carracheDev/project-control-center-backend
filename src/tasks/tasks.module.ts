import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { CorrectiveTaskService } from './corrective-task.service.js';

@Module({
  controllers: [TasksController],
  providers: [TasksService, CorrectiveTaskService],
  exports: [TasksService, CorrectiveTaskService],
})
export class TasksModule {}