import { Module } from '@nestjs/common';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceService } from './evidence.service.js';
import { FileStorageService } from './file-storage.service.js';

@Module({
  controllers: [EvidenceController],
  providers: [EvidenceService, FileStorageService],
  exports: [EvidenceService],
})
export class EvidenceModule {}