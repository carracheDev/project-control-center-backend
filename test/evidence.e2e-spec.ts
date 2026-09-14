import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Evidence (e2e)', () => {
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
    await prisma.evidence.deleteMany();
    await prisma.response.deleteMany();
    await prisma.interview.deleteMany();
    await prisma.questionOption.deleteMany();
    await prisma.question.deleteMany();
    await prisma.questionnaire.deleteMany();
    await prisma.task.deleteMany();
    await prisma.criterion.deleteMany();
    await prisma.objective.deleteMany();
    await prisma.phase.deleteMany();
    await prisma.project.deleteMany();
  });

  async function createPhase(projectName: string) {
    const project = await request(app.getHttpServer()).post('/projects').send({ name: projectName }).expect(201);
    const phase = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: `${projectName} phase`, order: 1 }).expect(201);
    return phase.body as { id: string };
  }

  it('creates, verifies, filters and reads evidence without changing phase status', async () => {
    const phase = await createPhase('Evidence project');
    const criterion = await request(app.getHttpServer()).post(`/phases/${phase.id}/criteria`).send({ name: 'Criterion', required: true, order: 1 }).expect(201);
    const task = await request(app.getHttpServer()).post(`/phases/${phase.id}/tasks`).send({ title: 'Collect proof' }).expect(201);
    const evidence = await request(app.getHttpServer()).post(`/phases/${phase.id}/evidence`).send({ title: 'Workshop notes', type: 'NOTE', source: 'FIELD', note: 'Observed by the team', criterionId: criterion.body.id, taskId: task.body.id }).expect(201);

    expect(evidence.body.status).toBe('PENDING');
    await request(app.getHttpServer()).get(`/phases/${phase.id}/evidence?status=PENDING`).expect(200);
    const verified = await request(app.getHttpServer()).post(`/evidence/${evidence.body.id}/verify`).send({ verifiedBy: 'reviewer' }).expect(201);
    expect(verified.body.status).toBe('VERIFIED');
    expect(verified.body.verifiedBy).toBe('reviewer');
    expect(verified.body.verifiedAt).toBeTruthy();
    await request(app.getHttpServer()).get(`/evidence/${evidence.body.id}`).expect(200);
    const phaseAfterVerification = await prisma.phase.findUnique({ where: { id: phase.id } });
    expect(phaseAfterVerification?.status).toBe('PLANNED');
  });

  it('rejects evidence without a source and cross-phase relations', async () => {
    const phaseA = await createPhase('Evidence A');
    const phaseB = await createPhase('Evidence B');
    const criterionB = await request(app.getHttpServer()).post(`/phases/${phaseB.id}/criteria`).send({ name: 'Other criterion', required: false, order: 1 }).expect(201);
    await request(app.getHttpServer()).post(`/phases/${phaseA.id}/evidence`).send({ title: 'No source', type: 'NOTE', source: 'OTHER' }).expect(400);
    await request(app.getHttpServer()).post(`/phases/${phaseA.id}/evidence`).send({ title: 'Wrong criterion', type: 'DOCUMENT', source: 'DOCUMENT', filePath: '/tmp/evidence.pdf', criterionId: criterionB.body.id }).expect(422);
  });

  it('rejects invalid verification transition and supports deletion', async () => {
    const phase = await createPhase('Evidence transitions');
    const evidence = await request(app.getHttpServer()).post(`/phases/${phase.id}/evidence`).send({ title: 'Reject me', type: 'NOTE', source: 'FIELD', note: 'Review required' }).expect(201);
    await request(app.getHttpServer()).post(`/evidence/${evidence.body.id}/reject`).send({ verifiedBy: 'reviewer' }).expect(201);
    await request(app.getHttpServer()).post(`/evidence/${evidence.body.id}/verify`).send({ verifiedBy: 'reviewer' }).expect(409);
    await request(app.getHttpServer()).delete(`/evidence/${evidence.body.id}`).expect(200);
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});