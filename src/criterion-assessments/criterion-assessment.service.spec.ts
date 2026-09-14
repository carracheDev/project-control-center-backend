import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CriterionAssessmentService } from './criterion-assessment.service.js';

describe('CriterionAssessmentService', () => {
  const prisma = {
    criterion: { findUnique: vi.fn() },
    evidence: { findUnique: vi.fn() },
    criterionAssessment: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
  const service = new CriterionAssessmentService(prisma as never);
  const criterion = { id: 'criterion-1', phaseId: 'phase-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.criterion.findUnique.mockResolvedValue(criterion);
    prisma.evidence.findUnique.mockResolvedValue({ id: 'evidence-1', phaseId: 'phase-1' });
    prisma.criterionAssessment.findUnique.mockResolvedValue({ id: 'assessment-1', criterionId: 'criterion-1', status: 'PENDING' });
    prisma.criterionAssessment.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'assessment-1', ...data }));
    prisma.criterionAssessment.update.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'assessment-1', ...data }));
  });

  it('creates PENDING, SATISFIED and NOT_SATISFIED assessments with backend timestamps', async () => {
    const pending = await service.create('criterion-1', {});
    expect(pending).toEqual(expect.objectContaining({ status: 'PENDING', assessedAt: null }));
    const satisfied = await service.create('criterion-1', { status: 'SATISFIED' });
    expect(satisfied).toEqual(expect.objectContaining({ status: 'SATISFIED', assessedAt: expect.any(Date) }));
    const notSatisfied = await service.create('criterion-1', { status: 'NOT_SATISFIED' });
    expect(notSatisfied).toEqual(expect.objectContaining({ status: 'NOT_SATISFIED', assessedAt: expect.any(Date) }));
  });

  it('rejects duplicate assessments with a conflict', async () => {
    prisma.criterionAssessment.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' }));
    await expect(service.create('criterion-1', {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('gets, updates status and clears assessedAt when returning to PENDING', async () => {
    await expect(service.findOne('criterion-1')).resolves.toEqual(expect.objectContaining({ criterionId: 'criterion-1' }));
    prisma.criterionAssessment.findUnique.mockResolvedValue({ id: 'assessment-1', criterionId: 'criterion-1', status: 'PENDING', assessedAt: null });
    const satisfied = await service.update('assessment-1', { status: 'SATISFIED', assessedBy: 'reviewer' });
    expect(satisfied).toEqual(expect.objectContaining({ status: 'SATISFIED', assessedAt: expect.any(Date) }));
    const pending = await service.update('assessment-1', { status: 'PENDING' });
    expect(pending).toEqual(expect.objectContaining({ status: 'PENDING', assessedAt: null }));
  });

  it('accepts same-phase evidence and rejects cross-phase evidence', async () => {
    await service.create('criterion-1', { evidenceId: 'evidence-1' });
    prisma.evidence.findUnique.mockResolvedValue({ id: 'evidence-2', phaseId: 'phase-2' });
    await expect(service.create('criterion-1', { evidenceId: 'evidence-2' })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('handles missing criteria, assessments and evidence, and deletes assessments', async () => {
    prisma.criterion.findUnique.mockResolvedValue(null);
    await expect(service.create('missing', {})).rejects.toBeInstanceOf(NotFoundException);
    prisma.criterion.findUnique.mockResolvedValue(criterion);
    prisma.criterionAssessment.findUnique.mockResolvedValue(null);
    await expect(service.findOne('criterion-1')).resolves.toBeNull();
    await expect(service.remove('assessment-1')).rejects.toBeInstanceOf(NotFoundException);
    prisma.criterionAssessment.findUnique.mockResolvedValue({ id: 'assessment-1', criterionId: 'criterion-1', status: 'PENDING' });
    await service.remove('assessment-1');
    expect(prisma.criterionAssessment.delete).toHaveBeenCalledWith({ where: { id: 'assessment-1' } });
    prisma.evidence.findUnique.mockResolvedValue(null);
    await expect(service.create('criterion-1', { evidenceId: 'missing-evidence' })).rejects.toBeInstanceOf(NotFoundException);
  });
});