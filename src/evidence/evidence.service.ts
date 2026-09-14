import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EvidenceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEvidenceDto } from './dto/create-evidence.dto.js';
import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';
import { FileStorageService } from './file-storage.service.js';

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService, private readonly storage?: FileStorageService) {}

  async createUploaded(phaseId: string, dto: CreateEvidenceDto, file: Express.Multer.File) {
    if (!this.storage) throw new BadRequestException('Evidence upload storage is unavailable');
    const stored = await this.storage.store(file);
    try {
      return await this.prisma.evidence.create({ data: { phaseId, title: dto.title, description: dto.description, type: dto.type, source: 'UPLOAD', filePath: stored.filePath, originalFileName: stored.originalFileName, mimeType: stored.mimeType, fileSize: stored.fileSize, criterionId: dto.criterionId, taskId: dto.taskId, interviewId: dto.interviewId, collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : undefined } });
    } catch (error) {
      await this.storage.remove(stored.filePath);
      throw error;
    }
  }

  async getDownload(id: string) {
    const evidence = await this.getEvidence(id);
    if (!evidence.filePath || !evidence.mimeType || !evidence.originalFileName) throw new NotFoundException('Evidence file not found');
    return evidence;
  }

  async create(phaseId: string, dto: CreateEvidenceDto) {
    await this.ensurePhaseExists(phaseId);
    this.ensureSource(dto.url, dto.filePath, dto.note);
    await this.ensureRelationsBelongToPhase(phaseId, dto.criterionId, dto.taskId, dto.interviewId);
    this.ensureSafeFilePath(dto.filePath);
    return this.prisma.evidence.create({
      data: {
        phaseId,
        criterionId: dto.criterionId,
        taskId: dto.taskId,
        interviewId: dto.interviewId,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        source: dto.source,
        url: dto.url,
        filePath: dto.filePath,
        note: dto.note,
        collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : undefined,
      },
    });
  }

  async findAll(phaseId: string, status?: EvidenceStatus) {
    await this.ensurePhaseExists(phaseId);
    return this.prisma.evidence.findMany({
      where: { phaseId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        criterion: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
        interview: { select: { id: true, respondentName: true } },
      },
    });
  }

  async findOne(id: string) {
    const evidence = await this.prisma.evidence.findUnique({
      where: { id },
      include: {
        criterion: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
        interview: { select: { id: true, respondentName: true } },
      },
    });
    if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);
    return evidence;
  }

  async update(id: string, dto: UpdateEvidenceDto) {
    const current = await this.getEvidence(id);
    const url = dto.url === undefined ? current.url : dto.url;
    const filePath = dto.filePath === undefined ? current.filePath : dto.filePath;
    const note = dto.note === undefined ? current.note : dto.note;
    this.ensureSource(url, filePath, note);
    await this.ensureRelationsBelongToPhase(current.phaseId, dto.criterionId, dto.taskId, dto.interviewId);
    this.ensureSafeFilePath(filePath);
    return this.prisma.evidence.update({
      where: { id },
      data: {
        criterionId: dto.criterionId,
        taskId: dto.taskId,
        interviewId: dto.interviewId,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        source: dto.source,
        url: dto.url,
        filePath: dto.filePath,
        note: dto.note,
        collectedAt: dto.collectedAt === undefined ? undefined : dto.collectedAt ? new Date(dto.collectedAt) : null,
      },
    });
  }

  async remove(id: string) {
    const evidence = await this.getEvidence(id);
    const deleted = await this.prisma.evidence.delete({ where: { id } });
    await this.storage?.remove(evidence.filePath);
    return deleted;
  }

  async verify(id: string, verifiedBy?: string) {
    const evidence = await this.getEvidence(id);
    if (evidence.status === EvidenceStatus.REJECTED) {
      throw new ConflictException('Rejected evidence must be explicitly updated before verification');
    }
    if (evidence.status === EvidenceStatus.VERIFIED) return evidence;
    return this.prisma.evidence.update({
      where: { id },
      data: { status: EvidenceStatus.VERIFIED, verifiedAt: new Date(), verifiedBy },
    });
  }

  async reject(id: string, verifiedBy?: string) {
    const evidence = await this.getEvidence(id);
    if (evidence.status === EvidenceStatus.VERIFIED) {
      throw new ConflictException('Verified evidence cannot be rejected without an explicit metadata change');
    }
    if (evidence.status === EvidenceStatus.REJECTED) return evidence;
    return this.prisma.evidence.update({
      where: { id },
      data: { status: EvidenceStatus.REJECTED, verifiedAt: new Date(), verifiedBy },
    });
  }

  private async getEvidence(id: string) {
    const evidence = await this.prisma.evidence.findUnique({ where: { id } });
    if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);
    return evidence;
  }

  private async ensurePhaseExists(phaseId: string): Promise<void> {
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId } });
    if (!phase) throw new NotFoundException(`Phase ${phaseId} not found`);
  }

  private async ensureRelationsBelongToPhase(phaseId: string, criterionId?: string | null, taskId?: string | null, interviewId?: string | null): Promise<void> {
    if (criterionId) {
      const criterion = await this.prisma.criterion.findUnique({ where: { id: criterionId } });
      if (!criterion) throw new NotFoundException(`Criterion ${criterionId} not found`);
      if (criterion.phaseId !== phaseId) throw new UnprocessableEntityException('Criterion must belong to the same phase as the evidence');
    }
    if (taskId) {
      const task = await this.prisma.task.findUnique({ where: { id: taskId } });
      if (!task) throw new NotFoundException(`Task ${taskId} not found`);
      if (task.phaseId !== phaseId) throw new UnprocessableEntityException('Task must belong to the same phase as the evidence');
    }
    if (interviewId) {
      const interview = await this.prisma.interview.findUnique({ where: { id: interviewId } });
      if (!interview) throw new NotFoundException(`Interview ${interviewId} not found`);
      if (interview.phaseId !== phaseId) throw new UnprocessableEntityException('Interview must belong to the same phase as the evidence');
    }
  }

  private ensureSource(url?: string | null, filePath?: string | null, note?: string | null): void {
    if (!url && !filePath && !note) throw new BadRequestException('Evidence requires a url, filePath or note');
  }

  private ensureSafeFilePath(filePath?: string | null): void {
    if (!filePath) return;
    if (filePath.includes('\0') || filePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(filePath) || filePath.split(/[\\/]+/).includes('..')) {
      throw new BadRequestException('Evidence filePath must be a relative path without parent traversal');
    }
  }
}