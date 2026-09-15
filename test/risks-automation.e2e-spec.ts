import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Risk automation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let request: (_server: unknown) => E2eAgent;
  let auth: E2eAuthContext;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    auth = await createTestAuthContext(app, prisma);
    request = () => auth.admin;
  });

  beforeEach(async () => {
    await prisma.risk.deleteMany();
    await prisma.task.deleteMany();
    await prisma.phase.deleteMany();
    await prisma.project.deleteMany();
  });

  it('creates one corrective task for a critical open risk', async () => {
    const project = await request(app.getHttpServer()).post('/projects').send({ name: 'Risk automation project' }).expect(201);
    const phase = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: 'Discovery', order: 1 }).expect(201);

    const created = await request(app.getHttpServer())
      .post(`/projects/${project.body.id}/risks`)
      .send({ title: 'Client validation delay', phaseId: phase.body.id, probability: 5, impact: 3 })
      .expect(201);

    expect(created.body.automation).toEqual(expect.objectContaining({ correctiveTaskCreated: true }));
    const tasks = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/tasks`).expect(200);
    expect(tasks.body).toHaveLength(1);
    expect(tasks.body[0]).toEqual(expect.objectContaining({ title: '[Risque critique] Client validation delay', priority: 'HIGH', status: 'TODO' }));

    const updated = await request(app.getHttpServer()).patch(`/risks/${created.body.id}`).send({ description: 'Updated mitigation context' }).expect(200);
    expect(updated.body.automation).toEqual(expect.objectContaining({ correctiveTaskCreated: false }));
    expect((await request(app.getHttpServer()).get(`/phases/${phase.body.id}/tasks`).expect(200)).body).toHaveLength(1);
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});
