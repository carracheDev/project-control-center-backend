import { BadGatewayException, GatewayTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import { PccAiService } from './pcc-ai.service.js';

describe('PccAiService', () => {
  const prisma = {
    phase: { findUnique: vi.fn() },
    chatSession: { findUnique: vi.fn(), create: vi.fn() },
    chatMessage: { findMany: vi.fn(), create: vi.fn() },
  };
  const readinessService = { calculate: vi.fn() };
  const gatingService = { calculate: vi.fn() };
  const client = { chat: { completions: { create: vi.fn() } } };
  let service: PccAiService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PccAiService(prisma as never, readinessService as never, gatingService as never, client as never);
    prisma.chatSession.findUnique.mockResolvedValue(null);
    prisma.chatSession.create.mockResolvedValue({ id: 'session-1', phaseId: 'phase-1', interviewId: null });
    prisma.chatMessage.findMany.mockResolvedValue([]);
    prisma.chatMessage.create.mockResolvedValue({ id: 'message-1' });
    readinessService.calculate.mockResolvedValue({ phaseId: 'phase-1', ready: false, blockers: [], satisfiedConditions: [], nextActions: [], evaluatedAt: 'now' });
    gatingService.calculate.mockResolvedValue({ phaseId: 'phase-1', canValidate: false, blockers: [], satisfiedConditions: [], conditions: [], evaluatedAt: 'now' });
    prisma.phase.findUnique.mockResolvedValue({
      project: { name: 'PCC', description: 'Demo', startDate: null, endDate: null },
      name: 'Discovery', description: null, status: 'PLANNED', deadline: null,
      objectives: [{ name: 'Objective', description: null, order: 1 }],
      criteria: [{ name: 'Criterion', description: null, required: true, order: 1, assessment: { status: 'PENDING', note: null } }],
      questionnaires: [{ name: 'Questionnaire', description: null, version: 1, status: 'ACTIVE', questions: [{ text: 'Question?', description: null, type: 'TEXT', required: true, order: 1, options: [] }] }],
      interviews: [{ id: 'interview-1', respondentName: 'Respondent', respondentRole: null, organization: null, status: 'COMPLETED', notes: null, responses: [{ id: 'response-1', question: { id: 'question-1', text: 'Question?' }, value: 'Answer' }] }],
      evidences: [{ id: 'evidence-1', title: 'Note', type: 'NOTE', status: 'PENDING', description: null, note: 'Demo', criterion: { name: 'Criterion' }, task: null, interview: null, interviewId: null }],
      validations: [],
    });
  });

  it('builds a focused context and gets diagnostics from existing services', async () => {
    const context = await service.buildPhaseContext('phase-1');
    expect(context.project.name).toBe('PCC');
    expect(context.criteria[0].assessmentStatus).toBe('PENDING');
    expect(context.interviews[0].responses[0]).toEqual({ question: 'Question?', value: 'Answer' });
    expect(readinessService.calculate).toHaveBeenCalledWith('phase-1');
    expect(gatingService.calculate).toHaveBeenCalledWith('phase-1');
  });

  it('parses a structured Groq response', async () => {
    client.chat.completions.create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      status: 'NOT_READY', summary: 'Blocked', strengths: ['Evidence'], blockers: ['Criterion'], missingInformation: [], contradictions: [], recommendations: ['Assess criterion'], validationAdvice: 'Do not validate yet',
    }) } }] });
    await expect(service.analyzePhase('phase-1')).resolves.toMatchObject({ status: 'NOT_READY', blockers: ['Criterion'] });
  });

  it('answers chat questions from original answers and filters unknown citations', async () => {
    client.chat.completions.create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      answer: 'La réponse indique que le problème arrive tous les jours.',
      intent: 'QUESTION', confidence: 'HIGH',
      evidence: [
        { id: 'response-1', type: 'INTERVIEW_ANSWER', label: 'Réponse originale' },
        { id: 'invented-1', type: 'EVIDENCE', label: 'Citation inventée' },
      ],
      missingInformation: ['Nombre exact de problèmes'], suggestedNextQuestions: ['Combien de problèmes surviennent par jour ?'],
      criterionAssessment: { status: 'INSUFFICIENT_EVIDENCE', reason: 'Le nombre exact manque.' },
    }) } }] });

    const result = await service.chatPhase('phase-1', 'À quelle fréquence le problème arrive-t-il ?');

    expect(result.answer).toContain('tous les jours');
    expect(result.evidence).toEqual([{ id: 'response-1', type: 'INTERVIEW_ANSWER', label: 'Réponse originale' }]);
    expect(result.criterionAssessment?.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(client.chat.completions.create).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining('Answer') })]),
    }), expect.anything());
  });

  it('reuses a session and sends only recent history to the provider', async () => {
    prisma.chatSession.findUnique.mockResolvedValue({ id: 'session-existing', phaseId: 'phase-1', interviewId: null });
    prisma.chatMessage.findMany.mockResolvedValue([
      { role: 'USER', content: 'Combien de fois ce problème arrive-t-il ?' },
      { role: 'ASSISTANT', content: 'La fréquence indiquée est quotidienne.' },
    ]);
    client.chat.completions.create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      answer: 'Aucun montant financier n’est indiqué.', intent: 'QUESTION', confidence: 'HIGH', evidence: [], missingInformation: ['Montant financier'], suggestedNextQuestions: [],
    }) } }] });

    const result = await service.chatPhase('phase-1', 'Et financièrement ?', 'session-existing');

    expect(result.sessionId).toBe('session-existing');
    expect(prisma.chatSession.create).not.toHaveBeenCalled();
    expect(client.chat.completions.create).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining('Et financièrement') })]) }), expect.anything());
  });

  it('rejects an interview that does not belong to the phase', async () => {
    prisma.phase.findUnique.mockResolvedValueOnce({
      project: { name: 'PCC' },
      id: 'phase-1', name: 'Discovery', description: null, status: 'PLANNED',
      objectives: [], criteria: [], interviews: [], evidences: [],
    });
    await expect(service.chatPhase('phase-1', 'Question', undefined, 'missing-interview')).rejects.toThrow('Interview introuvable');
    expect(client.chat.completions.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid Gemini response', async () => {
    client.chat.completions.create.mockResolvedValue({ choices: [{ message: { content: '{invalid' } }] });
    await expect(service.analyzePhase('phase-1')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('maps provider failures without exposing internal details', async () => {
    client.chat.completions.create.mockRejectedValue(new Error('quota or secret details'));
    await expect(service.analyzePhase('phase-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps an aborted provider call to a timeout', async () => {
    client.chat.completions.create.mockImplementation((_params: unknown, options: { signal: AbortSignal }) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    (service as unknown as { timeoutMs: number }).timeoutMs = 1;
    await expect(service.analyzePhase('phase-1')).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it('fails cleanly when Gemini is not configured', async () => {
    const unavailable = new PccAiService(prisma as never, readinessService as never, gatingService as never, null);
    await expect(unavailable.analyzePhase('phase-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.phase.findUnique).not.toHaveBeenCalled();
  });
});
