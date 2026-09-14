import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PhaseStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationService } from './notification.service.js';
import { GatingService } from '../gating/gating.service.js';

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly soonWindowMs = 48 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationService, private readonly gating: GatingService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async scanDeadlines(): Promise<void> {
    const now = new Date();
    const soon = new Date(now.getTime() + this.soonWindowMs);
    const tasks = await this.prisma.task.findMany({ where: { deadline: { lte: soon }, status: { not: TaskStatus.DONE } }, select: { id: true, title: true, deadline: true, phase: { select: { projectId: true, name: true } } } });
    for (const task of tasks) {
      const overdue = task.deadline !== null && task.deadline < now;
      await this.notifyProject(task.phase.projectId, overdue ? 'Tâche en retard' : 'Tâche bientôt à échéance', task.title, { entityType: 'task', entityId: task.id });
    }
    const phases = await this.prisma.phase.findMany({ where: { deadline: { lte: soon }, status: { not: PhaseStatus.VALIDATED } }, select: { id: true, name: true, deadline: true, projectId: true, status: true } });
    for (const phase of phases) await this.notifyProject(phase.projectId, 'Phase bientôt à échéance', phase.name, { entityType: 'phase', entityId: phase.id });
    const blocked = await this.prisma.phase.findMany({ where: { status: PhaseStatus.LOCKED }, select: { id: true, name: true, projectId: true } });
    for (const phase of blocked) await this.notifyProject(phase.projectId, 'Phase bloquée', phase.name, { entityType: 'phase', entityId: phase.id });
    const candidates = await this.prisma.phase.findMany({ where: { status: { in: [PhaseStatus.PLANNED, PhaseStatus.IN_PROGRESS, PhaseStatus.REOPENED] } }, select: { id: true, name: true, projectId: true } });
    for (const phase of candidates) {
      const gating = await this.gating.calculate(phase.id);
      if (gating.canValidate) await this.notifyProject(phase.projectId, 'Phase prête à être validée', phase.name, { entityType: 'phase', entityId: phase.id });
    }
  }

  private async notifyProject(projectId: string, title: string, body: string, data: Record<string, string>) {
    try { await this.notifications.notifyProject(projectId, title, body, data); }
    catch (error) { this.logger.warn(`Alert delivery failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
  }
}
