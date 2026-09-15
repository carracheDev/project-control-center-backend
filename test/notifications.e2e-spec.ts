import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAuthContext } from './helpers/auth.js';

describe('Persistent notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auth: E2eAuthContext;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    auth = await createTestAuthContext(app, prisma);
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
  });

  it('isolates notifications and supports read and resolve transitions', async () => {
    const managerId = auth.userIds[1];
    await prisma.notification.create({ data: { userId: managerId, title: 'Action requise', body: 'Une revue est attendue.', dedupeKey: `notification-test-${Date.now()}` } });

    const managerNotifications = await auth.manager.get('/notifications').expect(200);
    expect(managerNotifications.body).toHaveLength(1);
    expect(managerNotifications.body[0].status).toBe('UNREAD');
    const notificationId = managerNotifications.body[0].id as string;

    await auth.admin.get('/notifications').expect(200).then((response) => expect(response.body).toHaveLength(0));
    const read = await auth.manager.patch(`/notifications/${notificationId}/read`).expect(200);
    expect(read.body.status).toBe('READ');
    const resolved = await auth.manager.patch(`/notifications/${notificationId}/resolve`).expect(200);
    expect(resolved.body.status).toBe('RESOLVED');
    expect((await auth.manager.get('/notifications').expect(200)).body).toHaveLength(0);
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});
