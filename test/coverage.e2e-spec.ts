import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Research coverage (e2e)', () => {
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
    await prisma.coverageRequirement.deleteMany();
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

  async function createPhase(name: string) {
    const project = await request(app.getHttpServer()).post('/projects').send({ name }).expect(201);
    const phase = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: `${name} phase`, order: 1 }).expect(201);
    return phase.body as { id: string };
  }

  it('calculates coverage from a completed interview response', async () => {
    const phase = await createPhase('Coverage project');
    const objective = await request(app.getHttpServer()).post(`/phases/${phase.id}/objectives`).send({ name: 'Understand the need', order: 1 }).expect(201);
    const questionnaire = await request(app.getHttpServer()).post(`/phases/${phase.id}/questionnaires`).send({ name: 'Research guide', version: 1 }).expect(201);
    const question = await request(app.getHttpServer()).post(`/questionnaires/${questionnaire.body.id}/questions`).send({ text: 'What is the need?', type: 'LONG_TEXT', required: true, order: 1, objectiveId: objective.body.id }).expect(201);
    const requirement = await request(app.getHttpServer()).post(`/phases/${phase.id}/coverage-requirements`).send({ name: 'Need coverage', objectiveId: objective.body.id, minimumInterviews: 1, required: true }).expect(201);
    const interview = await request(app.getHttpServer()).post(`/phases/${phase.id}/interviews`).send({ questionnaireId: questionnaire.body.id, respondentName: 'Respondent' }).expect(201);

    const beforeResponse = await request(app.getHttpServer()).get(`/phases/${phase.id}/coverage`).expect(200);
    expect(beforeResponse.body.completedInterviews).toBe(0);
    expect(beforeResponse.body.requirements[0].coveredInterviews).toBe(0);
    await request(app.getHttpServer()).post(`/interviews/${interview.body.id}/responses`).send({ questionId: question.body.id, value: 'A real need' }).expect(201);
    await request(app.getHttpServer()).patch(`/interviews/${interview.body.id}`).send({ status: 'COMPLETED' }).expect(200);

    const coverage = await request(app.getHttpServer()).get(`/phases/${phase.id}/coverage`).expect(200);
    expect(coverage.body.requirements).toEqual([expect.objectContaining({ requirementId: requirement.body.id, coveredInterviews: 1, percentage: 100, satisfied: true })]);
    expect(coverage.body.completedInterviews).toBe(1);
    expect(coverage.body.allRequiredSatisfied).toBe(true);
    expect((await prisma.phase.findUnique({ where: { id: phase.id } }))?.status).toBe('PLANNED');
  });

  it('supports phase-level coverage and rejects cross-phase objectives', async () => {
    const phaseA = await createPhase('Coverage A');
    const phaseB = await createPhase('Coverage B');
    const objectiveB = await request(app.getHttpServer()).post(`/phases/${phaseB.id}/objectives`).send({ name: 'Other objective', order: 1 }).expect(201);
    await request(app.getHttpServer()).post(`/phases/${phaseA.id}/coverage-requirements`).send({ name: 'Invalid objective coverage', objectiveId: objectiveB.body.id, minimumInterviews: 1 }).expect(422);
    const requirement = await request(app.getHttpServer()).post(`/phases/${phaseA.id}/coverage-requirements`).send({ name: 'All completed interviews', minimumInterviews: 2, required: false }).expect(201);
    const coverage = await request(app.getHttpServer()).get(`/phases/${phaseA.id}/coverage`).expect(200);
    expect(coverage.body.requirements).toEqual([expect.objectContaining({ requirementId: requirement.body.id, objectiveId: null, coveredInterviews: 0, percentage: 0, satisfied: false })]);
    await request(app.getHttpServer()).patch(`/coverage-requirements/${requirement.body.id}`).send({ minimumInterviews: 3 }).expect(200);
    await request(app.getHttpServer()).delete(`/coverage-requirements/${requirement.body.id}`).expect(200);
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});