import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Phase gating (e2e)', () => {
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

  it('evaluates configured exit conditions without validating the phase', async () => {
    const project = await request(app.getHttpServer()).post('/projects').send({ name: 'Gating project' }).expect(201);
    const phase = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: 'Discovery', order: 1 }).expect(201);
    const initial = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    expect(initial.body).toEqual(expect.objectContaining({ phaseId: phase.body.id, canValidate: true, blockers: [], conditions: [], evaluatedAt: expect.any(String) }));

    const objective = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/objectives`).send({ name: 'Understand problem', order: 1 }).expect(201);
    const questionnaire = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/questionnaires`).send({ name: 'Interview guide', version: 1 }).expect(201);
    const question = await request(app.getHttpServer()).post(`/questionnaires/${questionnaire.body.id}/questions`).send({ text: 'What is the problem?', type: 'LONG_TEXT', required: true, order: 1, objectiveId: objective.body.id }).expect(201);
    const requirement = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/coverage-requirements`).send({ name: 'Problem coverage', objectiveId: objective.body.id, minimumInterviews: 1, required: true }).expect(201);

    const insufficient = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    expect(insufficient.body.canValidate).toBe(false);
    expect(insufficient.body.blockers).toContain('Coverage Problem coverage');

    const interview = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/interviews`).send({ questionnaireId: questionnaire.body.id, respondentName: 'Respondent' }).expect(201);
    await request(app.getHttpServer()).post(`/interviews/${interview.body.id}/responses`).send({ questionId: question.body.id, value: 'A real problem' }).expect(201);
    await request(app.getHttpServer()).patch(`/interviews/${interview.body.id}`).send({ status: 'COMPLETED' }).expect(200);

    const covered = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    expect(covered.body.conditions).toContainEqual(expect.objectContaining({ code: `COVERAGE_REQUIRED_${requirement.body.id}`, satisfied: true }));
    expect(covered.body.blockers).not.toContain('Coverage Problem coverage');

    const criterion = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/criteria`).send({ name: 'Problem clearly defined', required: true, order: 1 }).expect(201);
    const criterionBlocked = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    expect(criterionBlocked.body.blockers).toContain('Problem clearly defined');
    expect(criterionBlocked.body.conditions).toContainEqual(expect.objectContaining({ code: `CRITERION_REQUIRED_${criterion.body.id}`, satisfied: false }));

    const task = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/tasks`).send({ title: 'Resolve dependency', status: 'BLOCKED' }).expect(201);
    const taskBlocked = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    expect(taskBlocked.body.blockers).toContain('Tâche bloquée : Resolve dependency');
    await request(app.getHttpServer()).patch(`/tasks/${task.body.id}`).send({ status: 'DONE' }).expect(200);
    const taskDone = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    expect(taskDone.body.blockers).not.toContain('Tâche bloquée : Resolve dependency');
    expect(taskDone.body.satisfiedConditions).toContain('Tâche terminée : Resolve dependency');
    expect((await prisma.phase.findUnique({ where: { id: phase.body.id } }))?.status).toBe('PLANNED');
  });

  it('returns not found for a missing phase', async () => {
    await request(app.getHttpServer()).get('/phases/missing/gating').expect(404);
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});