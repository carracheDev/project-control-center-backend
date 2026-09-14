import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOptionDto } from './dto/create-option.dto.js';
import { CreateQuestionDto } from './dto/create-question.dto.js';
import { UpdateOptionDto } from './dto/update-option.dto.js';
import { UpdateQuestionDto } from './dto/update-question.dto.js';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(questionnaireId: string, dto: CreateQuestionDto) {
    const questionnaire = await this.getQuestionnaire(questionnaireId);
    await this.ensureObjectiveMatchesPhase(dto.objectiveId, questionnaire.phaseId);
    try {
      return await this.prisma.question.create({
        data: {
          questionnaireId,
          text: dto.text,
          description: dto.description,
          type: dto.type,
          required: dto.required,
          order: dto.order,
          objectiveId: dto.objectiveId,
        },
        include: { options: { orderBy: { order: 'asc' } } },
      });
    } catch (error) {
      this.handleConstraintError(error, 'Question order must be unique within a questionnaire');
    }
  }

  async findAll(questionnaireId: string) {
    await this.getQuestionnaire(questionnaireId);
    return this.prisma.question.findMany({
      where: { questionnaireId },
      orderBy: { order: 'asc' },
      include: { options: { orderBy: { order: 'asc' } } },
    });
  }

  async findOne(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    if (!question) throw new NotFoundException(`Question ${id} not found`);
    return question;
  }

  async update(id: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException(`Question ${id} not found`);
    const questionnaire = await this.getQuestionnaire(question.questionnaireId);
    await this.ensureObjectiveMatchesPhase(dto.objectiveId, questionnaire.phaseId);
    try {
      return await this.prisma.question.update({
        where: { id },
        data: {
          text: dto.text,
          description: dto.description,
          type: dto.type,
          required: dto.required,
          order: dto.order,
          objectiveId: dto.objectiveId,
        },
        include: { options: { orderBy: { order: 'asc' } } },
      });
    } catch (error) {
      this.handleConstraintError(error, 'Question order must be unique within a questionnaire');
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.question.delete({ where: { id } });
  }

  async createOption(questionId: string, dto: CreateOptionDto) {
    await this.ensureQuestionExists(questionId);
    try {
      return await this.prisma.questionOption.create({ data: { questionId, ...dto } });
    } catch (error) {
      this.handleConstraintError(error, 'Option order must be unique within a question');
    }
  }

  async findOptions(questionId: string) {
    await this.ensureQuestionExists(questionId);
    return this.prisma.questionOption.findMany({ where: { questionId }, orderBy: { order: 'asc' } });
  }

  async updateOption(id: string, dto: UpdateOptionDto) {
    const option = await this.prisma.questionOption.findUnique({ where: { id } });
    if (!option) throw new NotFoundException(`Option ${id} not found`);
    try {
      return await this.prisma.questionOption.update({ where: { id }, data: dto });
    } catch (error) {
      this.handleConstraintError(error, 'Option order must be unique within a question');
    }
  }

  async removeOption(id: string) {
    const option = await this.prisma.questionOption.findUnique({ where: { id } });
    if (!option) throw new NotFoundException(`Option ${id} not found`);
    return this.prisma.questionOption.delete({ where: { id } });
  }

  private async getQuestionnaire(id: string) {
    const questionnaire = await this.prisma.questionnaire.findUnique({ where: { id } });
    if (!questionnaire) throw new NotFoundException(`Questionnaire ${id} not found`);
    return questionnaire;
  }

  private async ensureQuestionExists(id: string): Promise<void> {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException(`Question ${id} not found`);
  }

  private async ensureObjectiveMatchesPhase(objectiveId: string | null | undefined, phaseId: string): Promise<void> {
    if (!objectiveId) return;
    const objective = await this.prisma.objective.findUnique({ where: { id: objectiveId } });
    if (!objective) throw new NotFoundException(`Objective ${objectiveId} not found`);
    if (objective.phaseId !== phaseId) {
      throw new UnprocessableEntityException('Objective must belong to the same phase as the questionnaire');
    }
  }

  private handleConstraintError(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw error;
  }
}