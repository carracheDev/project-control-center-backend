import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterPushTokenDto } from './dto/register-push-token.dto.js';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerToken(userId: string, dto: RegisterPushTokenDto) {
    return this.prisma.pushToken.upsert({ where: { token: dto.token }, update: { userId, platform: dto.platform, lastUsedAt: new Date() }, create: { userId, token: dto.token, platform: dto.platform, lastUsedAt: new Date() } });
  }

  async removeToken(userId: string, token: string) {
    return this.prisma.pushToken.deleteMany({ where: { userId, token } });
  }

  async sendToUsers(userIds: string[], title: string, body: string, data: Record<string, string> = {}): Promise<number> {
    const tokens = await this.prisma.pushToken.findMany({ where: { userId: { in: userIds } }, select: { id: true, token: true } });
    if (!tokens.length) return 0;
    const messaging = this.getMessaging();
    if (!messaging) return 0;
    const result = await messaging.sendEachForMulticast({ tokens: tokens.map((item) => item.token), notification: { title, body }, data });
    const invalidTokens = tokens.filter((_, index) => !result.responses[index].success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(result.responses[index].error?.code ?? '')).map((item) => item.id);
    if (invalidTokens.length) await this.prisma.pushToken.deleteMany({ where: { id: { in: invalidTokens } } });
    return result.successCount;
  }

  async notifyProject(projectId: string, title: string, body: string, data: Record<string, string> = {}): Promise<number> {
    const memberships = await this.prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } });
    const admins = await this.prisma.user.findMany({ where: { globalRole: 'ADMIN', isActive: true }, select: { id: true } });
    const userIds = [...new Set([...memberships.map((item) => item.userId), ...admins.map((item) => item.id)])];
    await Promise.all(userIds.map((userId) => this.prisma.notification.upsert({
      where: { dedupeKey: `${userId}:${projectId}:${data.entityType ?? title}:${data.entityId ?? body}` },
      update: {},
      create: {
        userId,
        projectId,
        title,
        body,
        entityType: data.entityType,
        entityId: data.entityId,
        dedupeKey: `${userId}:${projectId}:${data.entityType ?? title}:${data.entityId ?? body}`,
      },
    })));
    return this.sendToUsers(userIds, title, body, { projectId, ...data });
  }

  findForUser(userId: string) {
    return this.prisma.notification.findMany({ where: { userId, status: { not: NotificationStatus.RESOLVED } }, orderBy: { createdAt: 'desc' }, take: 30 });
  }

  async markRead(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({ where: { id, userId, status: NotificationStatus.UNREAD }, data: { status: NotificationStatus.READ, readAt: new Date() } });
    if (!result.count) throw new NotFoundException(`Notification ${id} not found`);
    return this.prisma.notification.findUnique({ where: { id } });
  }

  async resolve(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({ where: { id, userId, status: { not: NotificationStatus.RESOLVED } }, data: { status: NotificationStatus.RESOLVED, resolvedAt: new Date(), readAt: new Date() } });
    if (!result.count) throw new NotFoundException(`Notification ${id} not found`);
    return this.prisma.notification.findUnique({ where: { id } });
  }

  private getMessaging() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) return null;
    try {
      const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
      return getMessaging(app);
    } catch (error) {
      this.logger.error(`Firebase initialization failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return null;
    }
  }
}
