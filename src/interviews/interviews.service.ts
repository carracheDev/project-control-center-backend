import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InterviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateInterviewDto } from './dto/create-interview.dto.js';
import { UpdateInterviewDto } from './dto/update-interview.dto.js';

@Injectable()
export class InterviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(phaseId: string, dto: CreateInterviewDto) {
    await this.ensurePhaseExists(phaseId);
    await this.ensureQuestionnaireMatchesPhase(dto.questionnaireId, phaseId);
    if (dto.status === InterviewStatus.COMPLETED) {
      throw new BadRequestException('An interview must have responses before completion');
    }
    return this.prisma.interview.create({
      data: {
        phaseId,
        questionnaireId: dto.questionnaireId,
        respondentName: dto.respondentName,
        respondentRole: dto.respondentRole,
        organization: dto.organization,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
        status: dto.status,
        notes: dto.notes,
      },
    });
  }

  async findAll(phaseId: string) {
    await this.ensurePhaseExists(phaseId);
    return this.prisma.interview.findMany({
      where: { phaseId },
      orderBy: { createdAt: 'asc' },
      include: { questionnaire: { select: { id: true, name: true, version: true } } },
    });
  }

  async findOne(id: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        questionnaire: { include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } } } },
        responses: true,
      },
    });
    if (!interview) throw new NotFoundException(`Interview ${id} not found`);
    return interview;
  }

  async update(id: string, dto: UpdateInterviewDto) {
    const interview = await this.getInterview(id);
    const questionnaireId = dto.questionnaireId ?? interview.questionnaireId;
    await this.ensureQuestionnaireMatchesPhase(questionnaireId, interview.phaseId);
    if (dto.status === InterviewStatus.COMPLETED) {
      await this.ensureRequiredResponses(id, questionnaireId);
    }
    return this.prisma.interview.update({
      where: { id },
      data: {
        questionnaireId: dto.questionnaireId,
        respondentName: dto.respondentName,
        respondentRole: dto.respondentRole,
        organization: dto.organization,
        startedAt: dto.startedAt === undefined ? undefined : dto.startedAt ? new Date(dto.startedAt) : null,
        completedAt: dto.status === InterviewStatus.COMPLETED
          ? dto.completedAt ? new Date(dto.completedAt) : new Date()
          : dto.completedAt === undefined ? undefined : dto.completedAt ? new Date(dto.completedAt) : null,
        status: dto.status,
        notes: dto.notes,
      },
    });
  }

  async remove(id: string) {
    await this.getInterview(id);
    return this.prisma.interview.delete({ where: { id } });
  }

  private async getInterview(id: string) {
    const interview = await this.prisma.interview.findUnique({ where: { id } });
    if (!interview) throw new NotFoundException(`Interview ${id} not found`);
    return interview;
  }

  private async ensurePhaseExists(phaseId: string): Promise<void> {
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId } });
    if (!phase) throw new NotFoundException(`Phase ${phaseId} not found`);
  }

  private async ensureQuestionnaireMatchesPhase(questionnaireId: string, phaseId: string): Promise<void> {
    const questionnaire = await this.prisma.questionnaire.findUnique({ where: { id: questionnaireId } });
    if (!questionnaire) throw new NotFoundException(`Questionnaire ${questionnaireId} not found`);
    if (questionnaire.phaseId !== phaseId) {
      throw new UnprocessableEntityException('Questionnaire must belong to the same phase as the interview');
    }
  }

  private async ensureRequiredResponses(interviewId: string, questionnaireId: string): Promise<void> {
    const requiredQuestions = await this.prisma.question.findMany({
      where: { questionnaireId, required: true },
      select: { id: true },
    });
    if (requiredQuestions.length === 0) return;
    const responses = await this.prisma.response.findMany({
      where: { interviewId, questionId: { in: requiredQuestions.map((question) => question.id) } },
      select: { questionId: true },
    });
    const answered = new Set(responses.map((response) => response.questionId));
    const missing = requiredQuestions.filter((question) => !answered.has(question.id));
    if (missing.length > 0) {
      throw new BadRequestException('All required questions must have a response before completion');
    }
  }
}