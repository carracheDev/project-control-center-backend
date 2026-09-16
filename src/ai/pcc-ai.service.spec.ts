import { BadGatewayException, GatewayTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import { PccAiService } from './pcc-ai.service.js';

describe('PccAiService', () => {
  const prisma = { phase: { findUnique: vi.fn() } };
  const readinessService = { calculate: vi.fn() };
  const gatingService = { calculate: vi.fn() };
  const client = { chat: { completions: { create: vi.fn() } } };
  let service: PccAiService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PccAiService(prisma as never, readinessService as never, gatingService as never, client as never);
    readinessService.calculate.mockResolvedValue({ phaseId: 'phase-1', ready: false, blockers: [], satisfiedConditions: [], nextActions: [], evaluatedAt: 'now' });
    gatingService.calculate.mockResolvedValue({ phaseId: 'phase-1', canValidate: false, blockers: [], satisfiedConditions: [], conditions: [], evaluatedAt: 'now' });
    prisma.phase.findUnique.mockResolvedValue({
      project: { name: 'PCC', description: 'Demo', startDate: null, endDate: null },
      name: 'Discovery', description: null, status: 'PLANNED', deadline: null,
      objectives: [{ name: 'Objective', description: null, order: 1 }],
      criteria: [{ name: 'Criterion', description: null, required: true, order: 1, assessment: { status: 'PENDING', note: null } }],
      questionnaires: [{ name: 'Questionnaire', description: null, version: 1, status: 'ACTIVE', questions: [{ text: 'Question?', description: null, type: 'TEXT', required: true, order: 1, options: [] }] }],
      interviews: [{ respondentName: 'Respondent', respondentRole: null, organization: null, status: 'COMPLETED', notes: null, responses: [{ question: { text: 'Question?' }, value: 'Answer' }] }],
      evidences: [{ title: 'Note', type: 'NOTE', status: 'PENDING', description: null, note: 'Demo', criterion: { name: 'Criterion' }, task: null, interview: null }],
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
