import { NotFoundException } from '@nestjs/common';
import { QuestionnairesService } from './questionnaires.service.js';

describe('QuestionnairesService', () => {
  const questionnaire = { id: 'questionnaire-1', phaseId: 'phase-1', name: 'Interview guide', version: 1 };
  const prisma = {
    phase: { findUnique: vi.fn() },
    questionnaire: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
  const service = new QuestionnairesService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('creates a questionnaire for an existing phase', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.questionnaire.create.mockResolvedValue(questionnaire);
    await service.create('phase-1', { name: 'Interview guide', version: 1 });
    expect(prisma.questionnaire.create).toHaveBeenCalledWith({ data: { phaseId: 'phase-1', name: 'Interview guide', version: 1 } });
  });

  it('rejects a missing phase', async () => {
    prisma.phase.findUnique.mockResolvedValue(null);
    await expect(service.create('missing', { name: 'Guide', version: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reads, updates and deletes a questionnaire', async () => {
    prisma.questionnaire.findUnique.mockResolvedValue(questionnaire);
    prisma.questionnaire.update.mockResolvedValue(questionnaire);
    prisma.questionnaire.delete.mockResolvedValue(questionnaire);
    await service.findOne(questionnaire.id);
    await service.update(questionnaire.id, { name: 'Updated guide' });
    await service.remove(questionnaire.id);
    expect(prisma.questionnaire.update).toHaveBeenCalled();
    expect(prisma.questionnaire.delete).toHaveBeenCalledWith({ where: { id: questionnaire.id } });
  });
});