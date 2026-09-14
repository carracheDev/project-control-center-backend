import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateResponseDto } from './dto/create-response.dto.js';
import { UpdateResponseDto } from './dto/update-response.dto.js';

@Injectable()
export class ResponsesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(interviewId: string, dto: CreateResponseDto) {
    const interview = await this.getInterview(interviewId);
    await this.ensureQuestionBelongsToQuestionnaire(dto.questionId, interview.questionnaireId);
    try {
      return await this.prisma.response.create({ data: { interviewId, questionId: dto.questionId, value: dto.value } });
    } catch (error) {
      this.handleConstraintError(error);
    }
  }

  async findAll(interviewId: string) {
    await this.getInterview(interviewId);
    return this.prisma.response.findMany({
      where: { interviewId },
      orderBy: { createdAt: 'asc' },
      include: { question: { select: { id: true, text: true, type: true, required: true, order: true } } },
    });
  }

  async update(id: string, dto: UpdateResponseDto) {
    const response = await this.prisma.response.findUnique({
      where: { id },
      include: { interview: { select: { questionnaireId: true } } },
    });
    if (!response) throw new NotFoundException(`Response ${id} not found`);
    if (dto.questionId) await this.ensureQuestionBelongsToQuestionnaire(dto.questionId, response.interview.questionnaireId);
    try {
      return await this.prisma.response.update({
        where: { id },
        data: { questionId: dto.questionId, value: dto.value },
      });
    } catch (error) {
      this.handleConstraintError(error);
    }
  }

  async remove(id: string) {
    const response = await this.prisma.response.findUnique({ where: { id } });
    if (!response) throw new NotFoundException(`Response ${id} not found`);
    return this.prisma.response.delete({ where: { id } });
  }

  private async getInterview(id: string) {
    const interview = await this.prisma.interview.findUnique({ where: { id } });
    if (!interview) throw new NotFoundException(`Interview ${id} not found`);
    return interview;
  }

  private async ensureQuestionBelongsToQuestionnaire(questionId: string, questionnaireId: string): Promise<void> {
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException(`Question ${questionId} not found`);
    if (question.questionnaireId !== questionnaireId) {
      throw new UnprocessableEntityException('Question must belong to the interview questionnaire');
    }
  }

  private handleConstraintError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A response already exists for this question and interview');
    }
    throw error;
  }
}