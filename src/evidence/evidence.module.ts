import { Module } from '@nestjs/common';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceService } from './evidence.service.js';
import { FileStorageService } from './file-storage.service.js';
import { TasksModule } from '../tasks/tasks.module.js';

@Module({
  controllers: [EvidenceController],
  imports: [TasksModule],
  providers: [EvidenceService, FileStorageService],
  exports: [EvidenceService],
})
export class EvidenceModule {}