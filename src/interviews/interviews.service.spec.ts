import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { InterviewStatus } from '@prisma/client';
import { InterviewsService } from './interviews.service.js';

describe('InterviewsService', () => {
  const interview = { id: 'interview-1', phaseId: 'phase-1', questionnaireId: 'questionnaire-1', status: InterviewStatus.PLANNED };
  const prisma = {
    phase: { findUnique: vi.fn() },
    questionnaire: { findUnique: vi.fn() },
    interview: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    question: { findMany: vi.fn() },
    response: { findMany: vi.fn() },
  };
  const service = new InterviewsService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('creates an interview only with a questionnaire from the same phase', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.questionnaire.findUnique.mockResolvedValue({ id: 'questionnaire-1', phaseId: 'phase-2' });
    await expect(service.create('phase-1', { questionnaireId: 'questionnaire-1', respondentName: 'Alex' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    prisma.questionnaire.findUnique.mockResolvedValue({ id: 'questionnaire-1', phaseId: 'phase-1' });
    prisma.interview.create.mockResolvedValue(interview);
    await service.create('phase-1', { questionnaireId: 'questionnaire-1', respondentName: 'Alex' });
    expect(prisma.interview.create).toHaveBeenCalled();
  });

  it('changes interview status and supports CRUD', async () => {
    prisma.interview.findUnique.mockResolvedValue(interview);
    prisma.questionnaire.findUnique.mockResolvedValue({ id: 'questionnaire-1', phaseId: 'phase-1' });
    prisma.interview.update.mockResolvedValue({ ...interview, status: InterviewStatus.IN_PROGRESS });
    prisma.interview.delete.mockResolvedValue(interview);
    await service.update(interview.id, { status: InterviewStatus.IN_PROGRESS });
    await service.remove(interview.id);
    expect(prisma.interview.update).toHaveBeenCalled();
    expect(prisma.interview.delete).toHaveBeenCalled();
  });

  it('accepts completion when required responses exist and rejects missing responses', async () => {
    prisma.interview.findUnique.mockResolvedValue(interview);
    prisma.questionnaire.findUnique.mockResolvedValue({ id: 'questionnaire-1', phaseId: 'phase-1' });
    prisma.question.findMany.mockResolvedValue([{ id: 'question-1' }, { id: 'question-2' }]);
    prisma.response.findMany.mockResolvedValue([{ questionId: 'question-1' }]);
    await expect(service.update(interview.id, { status: InterviewStatus.COMPLETED })).rejects.toBeInstanceOf(BadRequestException);
    prisma.response.findMany.mockResolvedValue([{ questionId: 'question-1' }, { questionId: 'question-2' }]);
    prisma.interview.update.mockResolvedValue({ ...interview, status: InterviewStatus.COMPLETED });
    await service.update(interview.id, { status: InterviewStatus.COMPLETED });
    expect(prisma.interview.update).toHaveBeenCalled();
  });
});