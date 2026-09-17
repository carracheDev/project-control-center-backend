import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { GatingService, GatingResult } from '../gating/gating.service.js';
import { ReadinessService, PhaseReadinessResult } from '../readiness/readiness.service.js';
import { GROQ_CLIENT, GroqClient } from './ai.constants.js';

export type AiAnalysisStatus = 'READY' | 'NOT_READY' | 'ATTENTION';

export interface PccAiAnalysis {
  status: AiAnalysisStatus;
  summary: string;
  strengths: string[];
  blockers: string[];
  missingInformation: string[];
  contradictions: string[];
  recommendations: string[];
  validationAdvice: string;
}

export type PccAiIntent = 'QUESTION' | 'SUMMARY' | 'FIND_EVIDENCE' | 'IDENTIFY_GAPS' | 'COMPARE' | 'NEXT_QUESTION' | 'CRITERION_CHECK' | 'ANALYZE';
export type PccAiConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface PccAiChatResponse {
  answer: string;
  intent: PccAiIntent;
  confidence: PccAiConfidence;
  evidence: Array<{ id: string; type: 'INTERVIEW_ANSWER' | 'EVIDENCE' | 'CRITERION' | 'OBJECTIVE'; label: string; excerpt?: string }>;
  missingInformation: string[];
  suggestedNextQuestions: string[];
  criterionAssessment?: {
    status: 'SATISFIED' | 'PARTIALLY_SATISFIED' | 'NOT_SATISFIED' | 'INSUFFICIENT_EVIDENCE';
    reason: string;
  };
}

export interface PccAiChatResult extends PccAiChatResponse {
  sessionId: string;
}

export interface PccPhaseContext {
  project: {
    name: string;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  phase: {
    name: string;
    description: string | null;
    status: string;
    deadline: string | null;
  };
  objectives: Array<{ name: string; description: string | null; order: number }>;
  criteria: Array<{
    name: string;
    description: string | null;
    required: boolean;
    order: number;
    assessmentStatus: string | null;
    assessmentNote: string | null;
  }>;
  questionnaires: Array<{
    name: string;
    description: string | null;
    version: number;
    status: string;
    questions: Array<{ text: string; description: string | null; type: string; required: boolean; order: number; options: string[] }>;
  }>;
  interviews: Array<{
    respondentName: string;
    respondentRole: string | null;
    organization: string | null;
    status: string;
    notes: string | null;
    responses: Array<{ question: string; value: string }>;
  }>;
  evidence: Array<{
    title: string;
    type: string;
    status: string;
    description: string | null;
    note: string | null;
    criterion: string | null;
    task: string | null;
    interview: string | null;
  }>;
  readiness: PhaseReadinessResult;
  gating: GatingResult;
  validationHistory: Array<{ validatedAt: string; validatedBy: string | null; note: string | null }>;
}

const SYSTEM_INSTRUCTION = `Tu es PCC Intelligence, l'assistant d'analyse du Project Control Center.

Tu aides le responsable de projet à comprendre l'état réel d'un projet et de ses phases.
Tu analyses les objectifs, critères, questionnaires, interviews, réponses, preuves, readiness, gating et historique.
Tu ne prends jamais la décision finale. Tu ne valides jamais une phase. Tu ne modifies jamais les données.
Tu dois distinguer les faits présents dans PCC, les informations manquantes, les contradictions et les recommandations.
Si une condition obligatoire n'est pas satisfaite, explique précisément laquelle.
Si les données sont insuffisantes, dis-le explicitement.
Ne fabrique jamais d'information absente des données fournies.
La propriété validationAdvice est uniquement un conseil et ne déclenche aucune action.`;

const CHAT_SYSTEM_INSTRUCTION = `Tu es PCC Intelligence, un assistant contextuel de validation.
Réponds à la question de l'utilisateur uniquement à partir des données originales PCC fournies.
Les réponses d'interview et les preuves sont prioritaires sur toute analyse précédente.
Ne fabrique jamais de chiffre, date, nom, citation ou fait absent. Si une information manque, dis-le clairement.
Distingue les faits, les déductions et les informations manquantes.
Utilise uniquement les IDs de réponses et de preuves fournis pour les citations.
Réponds directement à la question, en français, sans reprendre automatiquement une analyse générale.`;

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['status', 'summary', 'strengths', 'blockers', 'missingInformation', 'contradictions', 'recommendations', 'validationAdvice'],
  properties: {
    status: { type: 'string', enum: ['READY', 'NOT_READY', 'ATTENTION'] },
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
    missingInformation: { type: 'array', items: { type: 'string' } },
    contradictions: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
    validationAdvice: { type: 'string' },
  },
};

const CHAT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['answer', 'intent', 'confidence', 'evidence', 'missingInformation', 'suggestedNextQuestions'],
  properties: {
    answer: { type: 'string' },
    intent: { type: 'string', enum: ['QUESTION', 'SUMMARY', 'FIND_EVIDENCE', 'IDENTIFY_GAPS', 'COMPARE', 'NEXT_QUESTION', 'CRITERION_CHECK', 'ANALYZE'] },
    confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
    evidence: { type: 'array', items: { type: 'object', required: ['id', 'type', 'label'], properties: { id: { type: 'string' }, type: { type: 'string', enum: ['INTERVIEW_ANSWER', 'EVIDENCE', 'CRITERION', 'OBJECTIVE'] }, label: { type: 'string' }, excerpt: { type: 'string' } } } },
    missingInformation: { type: 'array', items: { type: 'string' } },
    suggestedNextQuestions: { type: 'array', items: { type: 'string' } },
    criterionAssessment: { type: 'object', required: ['status', 'reason'], properties: { status: { type: 'string' }, reason: { type: 'string' } } },
  },
};

@Injectable()
export class PccAiService {
  private readonly model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
  private readonly timeoutMs = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly readinessService: ReadinessService,
    private readonly gatingService: GatingService,
    @Optional() @Inject(GROQ_CLIENT) private readonly groq: GroqClient | null,
  ) {}

  async analyzePhase(phaseId: string): Promise<PccAiAnalysis> {
    console.log('[PccAiService] ANALYZE started', { phaseId, model: this.model, groqConfigured: Boolean(this.groq) });
    if (!this.groq) {
      console.log('[PccAiService] Groq client unavailable');
      throw new ServiceUnavailableException('Le service IA est indisponible: GROQ_API_KEY n’est pas configurée.');
    }

    console.log('[PccAiService] Building phase context', { phaseId });
    const context = await this.buildPhaseContext(phaseId);
    console.log('[PccAiService] Phase context ready', {
      phaseId,
      objectives: context.objectives.length,
      criteria: context.criteria.length,
      questionnaires: context.questionnaires.length,
      interviews: context.interviews.length,
      evidence: context.evidence.length,
      ready: context.readiness.ready,
      canValidate: context.gating.canValidate,
    });
    console.log('[PccAiService] Sending analysis to Groq', { phaseId, model: this.model });
    return this.requestAnalysis(context, 'Analyse cette phase PCC et explique clairement sa situation actuelle.');
  }

  async chatPhase(phaseId: string, message: string, sessionId?: string, interviewId?: string): Promise<PccAiChatResult> {
    if (message.trim().length === 0) throw new BadGatewayException('La question ne peut pas être vide.');
    if (!this.groq) {
      throw new ServiceUnavailableException('Le service IA est indisponible: GROQ_API_KEY n’est pas configurée.');
    }

    const session = await this.getOrCreateChatSession(phaseId, sessionId, interviewId);
    const history = await this.prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { role: true, content: true },
    });
    const context = await this.buildChatContext(phaseId, session.interviewId ?? interviewId, history.reverse());
    await this.prisma.chatMessage.create({ data: { sessionId: session.id, role: 'USER', content: message.trim() } });
    const groq = this.groq;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await groq.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: `${CHAT_SYSTEM_INSTRUCTION}\n\nRéponds uniquement avec un JSON conforme à ce schéma : ${JSON.stringify(CHAT_RESPONSE_SCHEMA)}` },
          { role: 'user', content: JSON.stringify({ question: message.trim(), context }) },
        ],
        temperature: 0.1,
        max_tokens: 1_500,
      }, { signal: controller.signal });
      const parsed = this.parseChatResponse(response.choices[0]?.message.content ?? undefined);
      const validIds = new Set([...context.answers.map((answer) => answer.id), ...context.evidence.map((item) => item.id), ...context.criteria.map((item) => item.id), ...context.objectives.map((item) => item.id)]);
      const result = { ...parsed, evidence: parsed.evidence.filter((item) => validIds.has(item.id)), sessionId: session.id };
      await this.prisma.chatMessage.create({ data: { sessionId: session.id, role: 'ASSISTANT', content: result.answer, intent: result.intent, metadata: result } });
      return result;
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof ServiceUnavailableException) throw error;
      if (controller.signal.aborted) throw new GatewayTimeoutException('Le service IA n’a pas répondu à temps.');
      throw new ServiceUnavailableException('Le service IA est temporairement indisponible.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getOrCreateChatSession(phaseId: string, sessionId?: string, interviewId?: string) {
    if (sessionId) {
      const session = await this.prisma.chatSession.findUnique({ where: { id: sessionId } });
      if (!session || session.phaseId !== phaseId) throw new NotFoundException('Session de chat introuvable.');
      if (interviewId && session.interviewId && session.interviewId !== interviewId) throw new NotFoundException('La session ne correspond pas à cette interview.');
      return session;
    }
    return this.prisma.chatSession.create({ data: { phaseId, interviewId } });
  }

  private async buildChatContext(phaseId: string, interviewId?: string | null, history: Array<{ role: string; content: string }> = []) {
    const phase = await this.prisma.phase.findUnique({
      where: { id: phaseId },
      include: {
        project: { select: { name: true } },
        objectives: { select: { id: true, name: true, description: true } },
        criteria: { select: { id: true, name: true, description: true, required: true } },
        interviews: {
          where: interviewId ? { id: interviewId } : undefined,
          orderBy: { createdAt: 'asc' },
          include: { responses: { include: { question: { select: { id: true, text: true } } } } },
        },
        evidences: { orderBy: { createdAt: 'asc' }, select: { id: true, title: true, type: true, description: true, note: true, interviewId: true } },
      },
    });
    if (!phase) throw new BadGatewayException('Phase introuvable.');
    if (interviewId && phase.interviews.length === 0) throw new NotFoundException('Interview introuvable dans cette phase.');
    return {
      project: phase.project,
      phase: { id: phase.id, name: phase.name, description: phase.description, status: phase.status },
      objectives: phase.objectives,
      criteria: phase.criteria,
      interviews: phase.interviews.map((interview) => ({ id: interview.id, respondentName: interview.respondentName, respondentRole: interview.respondentRole, organization: interview.organization, status: interview.status, notes: interview.notes })),
      answers: phase.interviews.flatMap((interview) => interview.responses.map((response) => ({ id: response.id, interviewId: interview.id, respondentName: interview.respondentName, questionId: response.question.id, question: response.question.text, value: response.value }))),
      evidence: phase.evidences,
      conversationHistory: history,
    };
  }

  private async requestAnalysis(context: PccPhaseContext, instruction: string): Promise<PccAiAnalysis> {
    const groq = this.groq;
    if (!groq) {
      throw new ServiceUnavailableException('Le service IA est indisponible: GROQ_API_KEY n’est pas configurée.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await groq.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: `${SYSTEM_INSTRUCTION}\n\nRéponds uniquement avec un JSON conforme à ce schéma : ${JSON.stringify(RESPONSE_SCHEMA)}` },
          { role: 'user', content: JSON.stringify({ instruction, context }) },
        ],
        temperature: 0.1,
        max_tokens: 1_500,
      }, { signal: controller.signal });
      console.log('[PccAiService] Groq response received', { model: this.model, choices: response.choices.length });
      console.log('[PccAiService] Parsing Groq JSON response');
      const analysis = this.parseAnalysis(response.choices[0]?.message.content ?? undefined);
      console.log('[PccAiService] Analysis completed', { status: analysis.status });
      return analysis;
    } catch (error) {
      if (error instanceof ServiceUnavailableException || error instanceof BadGatewayException) throw error;
      if (controller.signal.aborted) throw new GatewayTimeoutException('Le service IA n’a pas répondu à temps.');
      const providerStatus = this.providerStatus(error);
      const diagnostic = providerStatus === 401 || providerStatus === 403
        ? 'provider_authentication'
        : providerStatus === 429
          ? 'provider_quota_or_rate_limit'
          : providerStatus !== null && providerStatus >= 400 && providerStatus < 500
            ? 'provider_request_rejected'
            : providerStatus !== null && providerStatus >= 500
              ? 'provider_server_error'
              : 'provider_network_error';
      console.error('[PccAiService] Provider request failed', {
        diagnostic,
        status: providerStatus,
        model: this.model,
        providerMessage: this.providerMessage(error),
      });
      if (diagnostic === 'provider_authentication') {
        throw new ServiceUnavailableException('Le service IA a refusé l’authentification de la clé Groq.');
      }
      if (diagnostic === 'provider_quota_or_rate_limit') {
        throw new ServiceUnavailableException('Le quota ou la limite de débit du service IA est atteint.');
      }
      if (diagnostic === 'provider_request_rejected') {
        throw new BadGatewayException('Le service IA a refusé la requête. Vérifiez le modèle Groq configuré.');
      }
      throw new ServiceUnavailableException('Le service IA est temporairement indisponible.');
    } finally {
      clearTimeout(timeout);
    }
  }

  async buildPhaseContext(phaseId: string): Promise<PccPhaseContext> {
    const startedAt = Date.now();
    console.log('[PccAiService] Prisma phase fetch started', { phaseId, prismaServiceInjected: Boolean(this.prisma) });
    const phasePromise = this.prisma.phase.findUnique({
      where: { id: phaseId },
      include: {
        project: { select: { name: true, description: true, startDate: true, endDate: true } },
        objectives: { orderBy: { order: 'asc' }, select: { name: true, description: true, order: true } },
        criteria: {
          orderBy: { order: 'asc' },
          include: { assessment: { select: { status: true, note: true } } },
        },
        questionnaires: {
          orderBy: { createdAt: 'asc' },
          include: {
            questions: {
              orderBy: { order: 'asc' },
              include: { options: { orderBy: { order: 'asc' }, select: { label: true } } },
            },
          },
        },
        interviews: {
          orderBy: { createdAt: 'asc' },
          include: { responses: { include: { question: { select: { text: true } } } } },
        },
        evidences: {
          orderBy: { createdAt: 'asc' },
          include: {
            criterion: { select: { name: true } },
            task: { select: { title: true } },
            interview: { select: { respondentName: true } },
          },
        },
        validations: { orderBy: { validatedAt: 'asc' }, select: { validatedAt: true, validatedBy: true, note: true } },
      },
    });
    let phase: Awaited<typeof phasePromise>;
    try {
      phase = await Promise.race([
        phasePromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('Prisma phase fetch timed out after 10000ms'), { name: 'PrismaPhaseFetchTimeout' })), 10_000)),
      ]);
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const details = this.prismaErrorDetails(error);
      console.error('[PccAiService] Prisma phase fetch failed', {
        diagnostic: 'prisma_phase_fetch_failed',
        phaseId,
        durationMs,
        ...details,
      });
      throw new GatewayTimeoutException({
        message: 'La récupération de la phase depuis la base a échoué.',
        diagnostic: 'prisma_phase_fetch_failed',
        durationMs,
      });
    }

    if (!phase) {
      console.log('[PccAiService] Prisma phase fetch completed', { phaseId, phaseFound: false, durationMs: Date.now() - startedAt });
      throw new BadGatewayException('Phase introuvable.');
    }

    console.log('[PccAiService] Prisma phase fetch completed', { phaseId, phaseFound: true, projectId: phase.projectId, durationMs: Date.now() - startedAt });
    const readinessPromise = (async () => {
      console.log('[PccAiService] Readiness calculation started', { phaseId });
      const result = await this.readinessService.calculate(phaseId);
      console.log('[PccAiService] Readiness calculation completed', { phaseId, ready: result.ready, blockers: result.blockers.length });
      return result;
    })();
    const gatingPromise = (async () => {
      console.log('[PccAiService] Gating calculation started', { phaseId });
      const result = await this.gatingService.calculate(phaseId);
      console.log('[PccAiService] Gating calculation completed', { phaseId, canValidate: result.canValidate, blockers: result.blockers.length });
      return result;
    })();
    const [readiness, gating] = await Promise.all([readinessPromise, gatingPromise]);

    return {
      project: {
        name: phase.project.name,
        description: phase.project.description,
        startDate: phase.project.startDate?.toISOString() ?? null,
        endDate: phase.project.endDate?.toISOString() ?? null,
      },
      phase: {
        name: phase.name,
        description: phase.description,
        status: phase.status,
        deadline: phase.deadline?.toISOString() ?? null,
      },
      objectives: phase.objectives,
      criteria: phase.criteria.map((criterion) => ({
        name: criterion.name,
        description: criterion.description,
        required: criterion.required,
        order: criterion.order,
        assessmentStatus: criterion.assessment?.status ?? null,
        assessmentNote: criterion.assessment?.note ?? null,
      })),
      questionnaires: phase.questionnaires.map((questionnaire) => ({
        name: questionnaire.name,
        description: questionnaire.description,
        version: questionnaire.version,
        status: questionnaire.status,
        questions: questionnaire.questions.map((question) => ({
          text: question.text,
          description: question.description,
          type: question.type,
          required: question.required,
          order: question.order,
          options: question.options.map((option) => option.label),
        })),
      })),
      interviews: phase.interviews.map((interview) => ({
        respondentName: interview.respondentName,
        respondentRole: interview.respondentRole,
        organization: interview.organization,
        status: interview.status,
        notes: interview.notes,
        responses: interview.responses.map((response) => ({ question: response.question.text, value: response.value })),
      })),
      evidence: phase.evidences.map((item) => ({
        title: item.title,
        type: item.type,
        status: item.status,
        description: item.description,
        note: item.note,
        criterion: item.criterion?.name ?? null,
        task: item.task?.title ?? null,
        interview: item.interview?.respondentName ?? null,
      })),
      readiness,
      gating,
      validationHistory: phase.validations.map((validation) => ({
        validatedAt: validation.validatedAt.toISOString(),
        validatedBy: validation.validatedBy,
        note: validation.note,
      })),
    };
  }

  private parseAnalysis(text: string | undefined): PccAiAnalysis {
    if (!text) throw new BadGatewayException('Le service IA a renvoyé une réponse vide.');
    try {
      const parsed: unknown = JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
      if (!this.isAnalysis(parsed)) throw new Error('invalid shape');
      return parsed;
    } catch {
      throw new BadGatewayException('Le service IA a renvoyé une réponse invalide.');
    }
  }

  private parseChatResponse(text: string | undefined): PccAiChatResponse {
    if (!text) throw new BadGatewayException('Le service IA a renvoyé une réponse vide.');
    try {
      const parsed: unknown = JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
      if (!this.isChatResponse(parsed)) throw new Error('invalid shape');
      return parsed;
    } catch {
      throw new BadGatewayException('Le service IA a renvoyé une réponse de chat invalide.');
    }
  }

  private providerStatus(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null;
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : null;
  }

  private providerMessage(error: unknown): string | null {
    if (!error || typeof error !== 'object') return null;
    const providerError = (error as { error?: { message?: unknown } }).error;
    if (typeof providerError?.message !== 'string') return null;
    return providerError.message
      .replace(/gsk_[A-Za-z0-9_-]+/g, '[REDACTED_KEY]')
      .replace(/https?:\/\/\S+/g, '[REDACTED_URL]')
      .slice(0, 300);
  }

  private prismaErrorDetails(error: unknown): { errorName: string; errorMessage: string; prismaCode: string | null } {
    if (!error || typeof error !== 'object') return { errorName: 'UnknownError', errorMessage: String(error), prismaCode: null };
    const value = error as { name?: unknown; message?: unknown; code?: unknown };
    return {
      errorName: typeof value.name === 'string' ? value.name : 'UnknownError',
      errorMessage: typeof value.message === 'string' ? value.message.slice(0, 500) : 'Unknown Prisma error',
      prismaCode: typeof value.code === 'string' ? value.code : null,
    };
  }

  private isAnalysis(value: unknown): value is PccAiAnalysis {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    const arrays = ['strengths', 'blockers', 'missingInformation', 'contradictions', 'recommendations'];
    return ['READY', 'NOT_READY', 'ATTENTION'].includes(candidate.status as string)
      && typeof candidate.summary === 'string'
      && typeof candidate.validationAdvice === 'string'
      && arrays.every((key) => Array.isArray(candidate[key]) && (candidate[key] as unknown[]).every((item) => typeof item === 'string'));
  }

  private isChatResponse(value: unknown): value is PccAiChatResponse {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    const intents: PccAiIntent[] = ['QUESTION', 'SUMMARY', 'FIND_EVIDENCE', 'IDENTIFY_GAPS', 'COMPARE', 'NEXT_QUESTION', 'CRITERION_CHECK', 'ANALYZE'];
    const confidences: PccAiConfidence[] = ['HIGH', 'MEDIUM', 'LOW'];
    const evidence = candidate.evidence;
    return typeof candidate.answer === 'string'
      && intents.includes(candidate.intent as PccAiIntent)
      && confidences.includes(candidate.confidence as PccAiConfidence)
      && Array.isArray(evidence)
      && evidence.every((item) => {
        if (!item || typeof item !== 'object') return false;
        const entry = item as Record<string, unknown>;
        return typeof entry.id === 'string'
          && ['INTERVIEW_ANSWER', 'EVIDENCE', 'CRITERION', 'OBJECTIVE'].includes(entry.type as string)
          && typeof entry.label === 'string'
          && (entry.excerpt === undefined || typeof entry.excerpt === 'string');
      })
      && ['missingInformation', 'suggestedNextQuestions'].every((key) => Array.isArray(candidate[key]) && (candidate[key] as unknown[]).every((item) => typeof item === 'string'))
      && (candidate.criterionAssessment === undefined || this.isCriterionAssessment(candidate.criterionAssessment));
  }

  private isCriterionAssessment(value: unknown): value is PccAiChatResponse['criterionAssessment'] {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return ['SATISFIED', 'PARTIALLY_SATISFIED', 'NOT_SATISFIED', 'INSUFFICIENT_EVIDENCE'].includes(candidate.status as string)
      && typeof candidate.reason === 'string';
  }
}
