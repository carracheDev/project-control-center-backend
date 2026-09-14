import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateQuestionnaireDto } from './dto/create-questionnaire.dto.js';
import { UpdateQuestionnaireDto } from './dto/update-questionnaire.dto.js';

@Injectable()
export class QuestionnairesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(phaseId: string, dto: CreateQuestionnaireDto) {
    await this.ensurePhaseExists(phaseId);
    return this.prisma.questionnaire.create({ data: { phaseId, ...dto } });
  }

  async findAll(phaseId: string) {
    await this.ensurePhaseExists(phaseId);
    return this.prisma.questionnaire.findMany({
      where: { phaseId },
      orderBy: [{ createdAt: 'asc' }, { version: 'asc' }],
    });
  }

  async findOne(id: string) {
    const questionnaire = await this.prisma.questionnaire.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } } },
    });
    if (!questionnaire) throw new NotFoundException(`Questionnaire ${id} not found`);
    return questionnaire;
  }

  async update(id: string, dto: UpdateQuestionnaireDto) {
    await this.ensureExists(id);
    return this.prisma.questionnaire.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.questionnaire.delete({ where: { id } });
  }

  private async ensureExists(id: string): Promise<void> {
    const questionnaire = await this.prisma.questionnaire.findUnique({ where: { id } });
    if (!questionnaire) throw new NotFoundException(`Questionnaire ${id} not found`);
  }

  private async ensurePhaseExists(phaseId: string): Promise<void> {
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId } });
    if (!phase) throw new NotFoundException(`Phase ${phaseId} not found`);
  }
}