import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GlobalRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service.js';

const password = 'e2e-test-password';

export type E2eAgent = ReturnType<typeof request.agent>;

export interface E2eAuthContext {
  admin: E2eAgent;
  manager: E2eAgent;
  viewer: E2eAgent;
  userIds: string[];
}

export async function createTestUser(prisma: PrismaService, email: string, globalRole: GlobalRole = GlobalRole.USER) {
  return prisma.user.create({
    data: { email, passwordHash: await argon2.hash(password), globalRole },
    select: { id: true, email: true },
  });
}

export async function loginTestUser(app: INestApplication, email: string): Promise<E2eAgent> {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/auth/login').send({ email, password }).expect(201);
  return agent;
}

export async function createTestAuthContext(app: INestApplication, prisma: PrismaService): Promise<E2eAuthContext> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [admin, manager, viewer] = await Promise.all([
    createTestUser(prisma, `e2e-admin-${suffix}@example.test`, GlobalRole.ADMIN),
    createTestUser(prisma, `e2e-manager-${suffix}@example.test`),
    createTestUser(prisma, `e2e-viewer-${suffix}@example.test`),
  ]);
  return {
    admin: await loginTestUser(app, admin.email),
    manager: await loginTestUser(app, manager.email),
    viewer: await loginTestUser(app, viewer.email),
    userIds: [admin.id, manager.id, viewer.id],
  };
}

export async function cleanupTestAuthContext(app: INestApplication, prisma: PrismaService, auth: E2eAuthContext): Promise<void> {
  await prisma.project.deleteMany();
  await prisma.user.deleteMany({ where: { id: { in: auth.userIds } } });
  await app.close();
}

export function configureE2eApp(app: INestApplication): void {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
}