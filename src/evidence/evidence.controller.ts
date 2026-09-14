import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { join, resolve } from 'node:path';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateEvidenceDto } from './dto/create-evidence.dto.js';
import { EvidenceQueryDto } from './dto/evidence-query.dto.js';
import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';
import { VerifyEvidenceDto } from './dto/verify-evidence.dto.js';
import { EvidenceService } from './evidence.service.js';

@Controller()
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post('phases/:phaseId/evidence')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('phaseId') phaseId: string, @Body() dto: CreateEvidenceDto) {
    return this.evidenceService.create(phaseId, dto);
  }

  @Post('phases/:phaseId/evidence/upload')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.PROJECT_MANAGER)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(@Param('phaseId') phaseId: string, @Body() dto: CreateEvidenceDto, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Evidence file is required');
    return this.evidenceService.createUploaded(phaseId, dto, file);
  }

  @Get('phases/:phaseId/evidence')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  findAll(@Param('phaseId') phaseId: string, @Query() query: EvidenceQueryDto) {
    return this.evidenceService.findAll(phaseId, query.status);
  }

  @Get('evidence/:id')
  @ProjectAccess('id', 'evidence', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.evidenceService.findOne(id);
  }

  @Get('evidence/:id/download')
  @ProjectAccess('id', 'evidence', ProjectMemberRole.VIEWER)
  async download(@Param('id') id: string, @Res() response: Response) {
    const evidence = await this.evidenceService.getDownload(id);
    const filePath = evidence.filePath;
    const originalFileName = evidence.originalFileName;
    if (!filePath || !originalFileName) throw new BadRequestException('Evidence file metadata is incomplete');
    response.download(resolve(process.env.EVIDENCE_STORAGE_DIR ?? join(process.cwd(), 'storage', 'evidence'), filePath.replace(/^evidence[\\/]/, '')), originalFileName);
  }

  @Patch('evidence/:id')
  @ProjectAccess('id', 'evidence', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateEvidenceDto) {
    return this.evidenceService.update(id, dto);
  }

  @Delete('evidence/:id')
  @ProjectAccess('id', 'evidence', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.evidenceService.remove(id);
  }

  @Post('evidence/:id/verify')
  @ProjectAccess('id', 'evidence', ProjectMemberRole.PROJECT_MANAGER)
  verify(@Param('id') id: string, @Body() dto: VerifyEvidenceDto) {
    return this.evidenceService.verify(id, dto.verifiedBy);
  }

  @Post('evidence/:id/reject')
  @ProjectAccess('id', 'evidence', ProjectMemberRole.PROJECT_MANAGER)
  reject(@Param('id') id: string, @Body() dto: VerifyEvidenceDto) {
    return this.evidenceService.reject(id, dto.verifiedBy);
  }
}