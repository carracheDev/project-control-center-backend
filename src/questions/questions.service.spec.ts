import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QuestionsService } from './questions.service.js';

describe('QuestionsService', () => {
  const question = { id: 'question-1', questionnaireId: 'questionnaire-1', objectiveId: null, text: 'What?', order: 1 };
  const option = { id: 'option-1', questionId: question.id, label: 'Yes', value: 'yes', order: 1 };
  const prisma = {
    questionnaire: { findUnique: vi.fn() },
    objective: { findUnique: vi.fn() },
    question: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    questionOption: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
  const service = new QuestionsService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('creates a question and rejects duplicate order', async () => {
    prisma.questionnaire.findUnique.mockResolvedValue({ id: 'questionnaire-1', phaseId: 'phase-1' });
    prisma.question.create.mockResolvedValue(question);
    await service.create('questionnaire-1', { text: 'What?', type: 'TEXT', required: true, order: 1 });
    expect(prisma.question.create).toHaveBeenCalled();
    prisma.question.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }));
    await expect(service.create('questionnaire-1', { text: 'Duplicate', type: 'TEXT', required: false, order: 1 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an objective from another phase', async () => {
    prisma.questionnaire.findUnique.mockResolvedValue({ id: 'questionnaire-1', phaseId: 'phase-1' });
    prisma.objective.findUnique.mockResolvedValue({ id: 'objective-1', phaseId: 'phase-2' });
    await expect(service.create('questionnaire-1', { text: 'What?', type: 'TEXT', required: false, order: 1, objectiveId: 'objective-1' })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('creates, updates and deletes an option', async () => {
    prisma.question.findUnique.mockResolvedValue(question);
    prisma.questionOption.create.mockResolvedValue(option);
    prisma.questionOption.findUnique.mockResolvedValue(option);
    prisma.questionOption.update.mockResolvedValue(option);
    prisma.questionOption.delete.mockResolvedValue(option);
    await service.createOption(question.id, { label: 'Yes', value: 'yes', order: 1 });
    await service.updateOption(option.id, { label: 'Oui' });
    await service.removeOption(option.id);
    expect(prisma.questionOption.update).toHaveBeenCalled();
    expect(prisma.questionOption.delete).toHaveBeenCalledWith({ where: { id: option.id } });
  });
});