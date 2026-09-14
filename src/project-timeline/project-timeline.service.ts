import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProjectTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async get(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        phases: {
          orderBy: { order: 'asc' },
          select: {
            id: true, name: true, order: true, status: true, startDate: true, endDate: true, deadline: true,
            tasks: { select: { id: true, title: true, status: true, deadline: true } },
          },
        },
      },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    return project;
  }
}
