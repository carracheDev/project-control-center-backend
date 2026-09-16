import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable,
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

@Injectable()
export class PccAiService {
  private readonly model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
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

  async chatPhase(phaseId: string, message: string): Promise<PccAiAnalysis> {
    if (!this.groq) {
      throw new ServiceUnavailableException('Le service IA est indisponible: GROQ_API_KEY n’est pas configurée.');
    }

    const context = await this.buildPhaseContext(phaseId);
    return this.requestAnalysis(context, `Réponds à cette question de l'utilisateur à partir des faits PCC fournis : ${message}`);
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
    console.log('[PccAiService] Prisma phase fetch started', { phaseId });
    const phase = await this.prisma.phase.findUnique({
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

    if (!phase) {
      throw new BadGatewayException('Phase introuvable.');
    }

    console.log('[PccAiService] Prisma phase fetch completed', { phaseId, projectId: phase.projectId });
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

  private isAnalysis(value: unknown): value is PccAiAnalysis {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    const arrays = ['strengths', 'blockers', 'missingInformation', 'contradictions', 'recommendations'];
    return ['READY', 'NOT_READY', 'ATTENTION'].includes(candidate.status as string)
      && typeof candidate.summary === 'string'
      && typeof candidate.validationAdvice === 'string'
      && arrays.every((key) => Array.isArray(candidate[key]) && (candidate[key] as unknown[]).every((item) => typeof item === 'string'));
  }
}
