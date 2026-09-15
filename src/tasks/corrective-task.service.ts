import { Injectable } from '@nestjs/common';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CorrectiveTaskService {
  constructor(private readonly prisma: PrismaService) {}

  createForRisk(input: { phaseId: string; title: string; description: string | null; assigneeId: string | null }) {
    return this.ensureTask(
      input.phaseId,
      `[Risque critique] ${input.title}`,
      input.description || `Analyser et réduire le risque critique « ${input.title} ».`,
      input.assigneeId,
    );
  }

  createForEvidence(input: { phaseId: string; title: string }) {
    return this.ensureTask(
      input.phaseId,
      `[Preuve rejetée] ${input.title}`,
      `Remplacer ou corriger la preuve rejetée « ${input.title} ».`,
      null,
    );
  }

  createForCriterion(input: { phaseId: string; title: string }) {
    return this.ensureTask(
      input.phaseId,
      `[Critère non satisfait] ${input.title}`,
      `Analyser et rendre satisfaisant le critère obligatoire « ${input.title} ».`,
      null,
    );
  }

  private async ensureTask(phaseId: string, title: string, description: string, assigneeId: string | null) {
    const existingTask = await this.prisma.task.findFirst({ where: { phaseId, title }, select: { id: true } });
    if (existingTask) return null;
    return this.prisma.task.create({
      data: { phaseId, title, description, assigneeId, priority: TaskPriority.HIGH, status: TaskStatus.TODO },
      select: { id: true },
    });
  }
}
