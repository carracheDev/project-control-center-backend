import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { PhaseValidationService } from './phase-validation.service.js';

describe('PhaseValidationService', () => {
  const prisma = {
    phase: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    phaseValidation: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  const gatingService = { calculate: vi.fn() };
  const phasesService = { getPhaseWorkflowState: vi.fn() };
  const service = new PhaseValidationService(prisma as never, gatingService as never, phasesService as never);
  const gating = {
    phaseId: 'phase-1',
    canValidate: true,
    blockers: [],
    satisfiedConditions: ['Problem defined'],
    conditions: [{ code: 'CRITERION_REQUIRED_1', label: 'Problem defined', required: true, satisfied: true }],
    evaluatedAt: '2026-09-11T12:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1', status: 'PLANNED', projectId: 'project-1', order: 1 });
    prisma.phase.findFirst.mockResolvedValue(null);
    phasesService.getPhaseWorkflowState.mockResolvedValue({ phaseId: 'phase-1', status: 'PLANNED', previousPhase: null, accessible: true, locked: false, reason: null });
    gatingService.calculate.mockResolvedValue(gating);
    prisma.phaseValidation.create.mockResolvedValue({ id: 'validation-1', phaseId: 'phase-1', gatingSnapshot: gating });
    prisma.phase.update.mockResolvedValue({ id: 'phase-1', status: 'VALIDATED' });
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
  });

  it('validates a phase transactionally and persists the gating snapshot', async () => {
    const result = await service.validate('phase-1', { validatedBy: 'reviewer', note: 'Approved' });
    expect(result.phase.status).toBe('VALIDATED');
    expect(prisma.phaseValidation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        phaseId: 'phase-1',
        validatedBy: 'reviewer',
        note: 'Approved',
        gatingSnapshot: {
          canValidate: true,
          blockers: [],
          satisfiedConditions: ['Problem defined'],
          conditions: gating.conditions,
          evaluatedAt: gating.evaluatedAt,
        },
      }),
    }));
    expect(prisma.phase.update).toHaveBeenCalledWith({ where: { id: 'phase-1' }, data: { status: 'VALIDATED' } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects blockers without changing phase or creating history', async () => {
    gatingService.calculate.mockResolvedValue({ ...gating, canValidate: false, blockers: ['Problem defined'] });
    await expect(service.validate('phase-1', {})).rejects.toMatchObject({ response: { message: 'Phase cannot be validated', blockers: ['Problem defined'] } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.phase.update).not.toHaveBeenCalled();
    expect(prisma.phaseValidation.create).not.toHaveBeenCalled();
  });

  it.each(['PLANNED', 'IN_PROGRESS', 'REOPENED'])('allows validation from %s', async (status) => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1', status, projectId: 'project-1', order: 1 });
    await expect(service.validate('phase-1', {})).resolves.toHaveProperty('phase.status', 'VALIDATED');
  });

  it.each(['VALIDATED', 'LOCKED'])('rejects validation from %s', async (status) => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1', status, projectId: 'project-1', order: 1 });
    const error = await service.validate('phase-1', {}).catch((caught) => caught);
    expect(error).toBeInstanceOf(status === 'VALIDATED' ? ConflictException : UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not create a duplicate validation for an already validated phase', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1', status: 'VALIDATED', projectId: 'project-1', order: 1 });
    await expect(service.validate('phase-1', {})).rejects.toBeInstanceOf(ConflictException);
    expect(gatingService.calculate).not.toHaveBeenCalled();
    expect(prisma.phaseValidation.create).not.toHaveBeenCalled();
  });

  it('rolls back the logical workflow when either transaction operation fails', async () => {
    prisma.phaseValidation.create.mockRejectedValueOnce(new Error('history failed'));
    await expect(service.validate('phase-1', {})).rejects.toThrow('history failed');
    expect(prisma.phase.update).not.toHaveBeenCalled();

    prisma.phaseValidation.create.mockResolvedValueOnce({ id: 'validation-1' });
    prisma.phase.update.mockRejectedValueOnce(new Error('phase update failed'));
    await expect(service.validate('phase-1', {})).rejects.toThrow('phase update failed');
    expect(prisma.phaseValidation.create).toHaveBeenCalled();
  });

  it('reads immutable validation history without exposing mutation operations', async () => {
    prisma.phaseValidation.findMany.mockResolvedValue([{ id: 'validation-1' }]);
    prisma.phaseValidation.findUnique.mockResolvedValue({ id: 'validation-1' });
    await expect(service.findAll('phase-1')).resolves.toEqual([{ id: 'validation-1' }]);
    await expect(service.findOne('validation-1')).resolves.toEqual({ id: 'validation-1' });
    expect(prisma.phaseValidation).not.toHaveProperty('update');
    expect(prisma.phaseValidation).not.toHaveProperty('delete');
  });
});