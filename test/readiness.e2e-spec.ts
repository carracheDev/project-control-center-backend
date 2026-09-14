import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Phase readiness (e2e)', () => {
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
    await prisma.coverageRequirement.deleteMany();
    await prisma.response.deleteMany();
    await prisma.interview.deleteMany();
    await prisma.question.deleteMany();
    await prisma.questionnaire.deleteMany();
    await prisma.task.deleteMany();
    await prisma.criterion.deleteMany();
    await prisma.objective.deleteMany();
    await prisma.phase.deleteMany();
    await prisma.project.deleteMany();
  });

  it('diagnoses a complete and then insufficient phase without changing its status', async () => {
    const project = await request(app.getHttpServer()).post('/projects').send({ name: 'Readiness project' }).expect(201);
    const phase = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: 'Discovery', order: 1 }).expect(201);
    const objective = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/objectives`).send({ name: 'Understand the need', order: 1 }).expect(201);
    const questionnaire = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/questionnaires`).send({ name: 'Discovery guide', version: 1 }).expect(201);
    const question = await request(app.getHttpServer()).post(`/questionnaires/${questionnaire.body.id}/questions`).send({ text: 'What is the need?', type: 'LONG_TEXT', required: true, order: 1, objectiveId: objective.body.id }).expect(201);
    const requirement = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/coverage-requirements`).send({ name: 'Need coverage', objectiveId: objective.body.id, minimumInterviews: 1, required: true }).expect(201);
    const interview = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/interviews`).send({ questionnaireId: questionnaire.body.id, respondentName: 'Respondent' }).expect(201);
    await request(app.getHttpServer()).post(`/interviews/${interview.body.id}/responses`).send({ questionId: question.body.id, value: 'A clear need' }).expect(201);
    await request(app.getHttpServer()).patch(`/interviews/${interview.body.id}`).send({ status: 'COMPLETED' }).expect(200);

    const ready = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/readiness`).expect(200);
    expect(ready.body).toEqual(expect.objectContaining({ phaseId: phase.body.id, ready: true, blockers: [], nextActions: expect.any(Array), evaluatedAt: expect.any(String) }));
    expect(ready.body.satisfiedConditions).toEqual([expect.objectContaining({ type: 'COVERAGE', relatedEntityId: requirement.body.id })]);

    await request(app.getHttpServer()).patch(`/coverage-requirements/${requirement.body.id}`).send({ minimumInterviews: 2 }).expect(200);
    const notReady = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/readiness`).expect(200);
    expect(notReady.body.ready).toBe(false);
    expect(notReady.body.blockers).toEqual([expect.objectContaining({ type: 'COVERAGE', relatedEntityId: requirement.body.id })]);
    expect(notReady.body.nextActions).toEqual([expect.objectContaining({ type: 'INTERVIEW', relatedEntityId: requirement.body.id })]);
    expect((await prisma.phase.findUnique({ where: { id: phase.body.id } }))?.status).toBe('PLANNED');
  });

  it('returns not found for a missing phase', async () => {
    await request(app.getHttpServer()).get('/phases/missing/readiness').expect(404);
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});