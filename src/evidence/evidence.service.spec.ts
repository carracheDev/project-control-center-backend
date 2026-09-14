import { BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { EvidenceStatus } from '@prisma/client';
import { EvidenceService } from './evidence.service.js';

describe('EvidenceService', () => {
  const evidence = {
    id: 'evidence-1',
    phaseId: 'phase-1',
    criterionId: null,
    taskId: null,
    interviewId: null,
    title: 'Research notes',
    description: null,
    type: 'NOTE',
    source: 'FIELD',
    url: null,
    filePath: null,
    note: 'Observed during workshop',
    status: EvidenceStatus.PENDING,
    verifiedAt: null,
    verifiedBy: null,
  };
  const prisma = {
    phase: { findUnique: vi.fn() },
    criterion: { findUnique: vi.fn() },
    task: { findUnique: vi.fn() },
    interview: { findUnique: vi.fn() },
    evidence: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
  const service = new EvidenceService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('creates valid evidence and rejects missing source', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.evidence.create.mockResolvedValue(evidence);
    await service.create('phase-1', { title: 'Research notes', type: 'NOTE', source: 'FIELD', note: 'Observed during workshop' });
    expect(prisma.evidence.create).toHaveBeenCalled();
    await expect(service.create('phase-1', { title: 'Empty', type: 'NOTE', source: 'FIELD' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects relations belonging to another phase', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.criterion.findUnique.mockResolvedValue({ id: 'criterion-1', phaseId: 'phase-2' });
    await expect(service.create('phase-1', { title: 'Invalid', type: 'DOCUMENT', source: 'DOCUMENT', filePath: '/tmp/doc.pdf', criterionId: 'criterion-1' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    prisma.criterion.findUnique.mockResolvedValue(null);
    prisma.task.findUnique.mockResolvedValue({ id: 'task-1', phaseId: 'phase-2' });
    await expect(service.create('phase-1', { title: 'Invalid', type: 'DOCUMENT', source: 'DOCUMENT', filePath: '/tmp/doc.pdf', taskId: 'task-1' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    prisma.task.findUnique.mockResolvedValue(null);
    prisma.interview.findUnique.mockResolvedValue({ id: 'interview-1', phaseId: 'phase-2' });
    await expect(service.create('phase-1', { title: 'Invalid', type: 'INTERVIEW', source: 'INTERVIEW', note: 'No', interviewId: 'interview-1' })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('updates metadata and rejects a relation change to another phase', async () => {
    prisma.evidence.findUnique.mockResolvedValue(evidence);
    prisma.evidence.update.mockResolvedValue(evidence);
    await service.update(evidence.id, { title: 'Updated notes' });
    expect(prisma.evidence.update).toHaveBeenCalled();
    prisma.criterion.findUnique.mockResolvedValue({ id: 'criterion-1', phaseId: 'phase-2' });
    await expect(service.update(evidence.id, { criterionId: 'criterion-1' })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('verifies pending evidence and records verification metadata', async () => {
    prisma.evidence.findUnique.mockResolvedValue(evidence);
    prisma.evidence.update.mockResolvedValue({ ...evidence, status: EvidenceStatus.VERIFIED });
    await service.verify(evidence.id, 'reviewer');
    expect(prisma.evidence.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: EvidenceStatus.VERIFIED, verifiedBy: 'reviewer', verifiedAt: expect.any(Date) }) }));
  });

  it('rejects pending evidence and prevents rejected to verified transition', async () => {
    prisma.evidence.findUnique.mockResolvedValue(evidence);
    prisma.evidence.update.mockResolvedValue({ ...evidence, status: EvidenceStatus.REJECTED });
    await service.reject(evidence.id, 'reviewer');
    expect(prisma.evidence.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: EvidenceStatus.REJECTED, verifiedAt: expect.any(Date) }) }));
    prisma.evidence.findUnique.mockResolvedValue({ ...evidence, status: EvidenceStatus.REJECTED });
    await expect(service.verify(evidence.id)).rejects.toBeInstanceOf(ConflictException);
  });
  
  it('rejects absolute and parent-traversing file paths', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    await expect(service.create('phase-1', { title: 'Invalid', type: 'DOCUMENT', source: 'DOCUMENT', filePath: '/etc/passwd' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('phase-1', { title: 'Invalid', type: 'DOCUMENT', source: 'DOCUMENT', filePath: 'evidence/../../secret.txt' })).rejects.toBeInstanceOf(BadRequestException);
  });
});