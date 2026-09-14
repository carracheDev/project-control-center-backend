import { UnprocessableEntityException } from '@nestjs/common';
import { ResponsesService } from './responses.service.js';

describe('ResponsesService', () => {
  const response = { id: 'response-1', interviewId: 'interview-1', questionId: 'question-1', value: 'Answer' };
  const prisma = {
    interview: { findUnique: vi.fn() },
    question: { findUnique: vi.fn() },
    response: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
  const service = new ResponsesService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('creates a response only for a question in the interview questionnaire', async () => {
    prisma.interview.findUnique.mockResolvedValue({ id: 'interview-1', questionnaireId: 'questionnaire-1' });
    prisma.question.findUnique.mockResolvedValue({ id: 'question-1', questionnaireId: 'questionnaire-2' });
    await expect(service.create('interview-1', { questionId: 'question-1', value: 'Answer' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    prisma.question.findUnique.mockResolvedValue({ id: 'question-1', questionnaireId: 'questionnaire-1' });
    prisma.response.create.mockResolvedValue(response);
    await service.create('interview-1', { questionId: 'question-1', value: 'Answer' });
    expect(prisma.response.create).toHaveBeenCalled();
  });

  it('updates and deletes a response', async () => {
    prisma.response.findUnique.mockResolvedValue({ ...response, interview: { questionnaireId: 'questionnaire-1' } });
    prisma.question.findUnique.mockResolvedValue({ id: 'question-1', questionnaireId: 'questionnaire-1' });
    prisma.response.update.mockResolvedValue(response);
    prisma.response.delete.mockResolvedValue(response);
    await service.update(response.id, { value: 'Updated answer' });
    await service.remove(response.id);
    expect(prisma.response.update).toHaveBeenCalled();
    expect(prisma.response.delete).toHaveBeenCalledWith({ where: { id: response.id } });
  });
});