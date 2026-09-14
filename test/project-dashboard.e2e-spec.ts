import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Project dashboard (e2e)', () => {
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
    await prisma.phaseValidation.deleteMany();
    await prisma.criterionAssessment.deleteMany();
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

  it('aggregates two isolated projects and recent validations', async () => {
    const projectA = await request(app.getHttpServer()).post('/projects').send({ name: 'Project A' }).expect(201);
    const projectB = await request(app.getHttpServer()).post('/projects').send({ name: 'Project B' }).expect(201);
    const a1 = await request(app.getHttpServer()).post(`/projects/${projectA.body.id}/phases`).send({ name: 'A Research', order: 1 }).expect(201);
    const a2 = await request(app.getHttpServer()).post(`/projects/${projectA.body.id}/phases`).send({ name: 'A Delivery', order: 2 }).expect(201);
    const a3 = await request(app.getHttpServer()).post(`/projects/${projectA.body.id}/phases`).send({ name: 'A Launch', order: 3 }).expect(201);
    const b1 = await request(app.getHttpServer()).post(`/projects/${projectB.body.id}/phases`).send({ name: 'B Research', order: 1 }).expect(201);
    const b2 = await request(app.getHttpServer()).post(`/projects/${projectB.body.id}/phases`).send({ name: 'B Delivery', order: 2 }).expect(201);

    await request(app.getHttpServer()).post(`/phases/${a1.body.id}/validate`).send({ validatedBy: 'lead' }).expect(201);
    await prisma.phase.update({ where: { id: a2.body.id }, data: { status: 'IN_PROGRESS' } });
    const objective = await request(app.getHttpServer()).post(`/phases/${a2.body.id}/objectives`).send({ name: 'Understand need', order: 1 }).expect(201);
    const criterion = await request(app.getHttpServer()).post(`/phases/${a2.body.id}/criteria`).send({ name: 'Need assessed', required: true, order: 1 }).expect(201);
    await request(app.getHttpServer()).post(`/criteria/${criterion.body.id}/assessment`).send({ status: 'NOT_SATISFIED' }).expect(201);
    await request(app.getHttpServer()).post(`/phases/${a2.body.id}/tasks`).send({ title: 'Blocked task', status: 'BLOCKED' }).expect(201);
    await request(app.getHttpServer()).post(`/phases/${a2.body.id}/tasks`).send({ title: 'Done task', status: 'DONE' }).expect(201);
    const questionnaire = await request(app.getHttpServer()).post(`/phases/${a2.body.id}/questionnaires`).send({ name: 'Guide', version: 1 }).expect(201);
    const question = await request(app.getHttpServer()).post(`/questionnaires/${questionnaire.body.id}/questions`).send({ text: 'Need?', type: 'TEXT', required: true, order: 1, objectiveId: objective.body.id }).expect(201);
    await request(app.getHttpServer()).post(`/phases/${a2.body.id}/coverage-requirements`).send({ name: 'Need coverage', objectiveId: objective.body.id, minimumInterviews: 2, required: true }).expect(201);
    const interview = await request(app.getHttpServer()).post(`/phases/${a2.body.id}/interviews`).send({ questionnaireId: questionnaire.body.id, respondentName: 'Respondent' }).expect(201);
    await request(app.getHttpServer()).post(`/interviews/${interview.body.id}/responses`).send({ questionId: question.body.id, value: 'Need' }).expect(201);
    await request(app.getHttpServer()).patch(`/interviews/${interview.body.id}`).send({ status: 'COMPLETED' }).expect(200);
    await request(app.getHttpServer()).post(`/phases/${a2.body.id}/evidence`).send({ title: 'Pending evidence', type: 'NOTE', source: 'manual', note: 'Pending' }).expect(201);
    const rejected = await request(app.getHttpServer()).post(`/phases/${a2.body.id}/evidence`).send({ title: 'Rejected evidence', type: 'NOTE', source: 'manual', note: 'Rejected' }).expect(201);
    await request(app.getHttpServer()).post(`/evidence/${rejected.body.id}/reject`).send({}).expect(201);

    const dashboard = await request(app.getHttpServer()).get('/dashboard').expect(200);
    expect(dashboard.body.summary).toEqual(expect.objectContaining({ totalProjects: 2, activeProjects: 2, blockedProjects: 2, projectsNeedingAttention: 2 }));
    const cardA = dashboard.body.projects.find((project: { id: string }) => project.id === projectA.body.id);
    const cardB = dashboard.body.projects.find((project: { id: string }) => project.id === projectB.body.id);
    expect(cardA).toEqual(expect.objectContaining({ progress: { completedPhases: 1, totalPhases: 3, percentage: 33 }, phase: expect.objectContaining({ id: a2.body.id, status: 'IN_PROGRESS' }), tasks: { total: 2, done: 1, blocked: 1 }, interviews: { total: 1, completed: 1 }, evidence: { total: 2, verified: 0, pending: 1, rejected: 1 } }));
    expect(cardA.attention.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'TASK' }), expect.objectContaining({ type: 'COVERAGE' }), expect.objectContaining({ type: 'CRITERION' }), expect.objectContaining({ phaseId: a3.body.id })]));
    expect(cardB).toEqual(expect.objectContaining({ progress: { completedPhases: 0, totalPhases: 2, percentage: 0 }, phase: expect.objectContaining({ id: b1.body.id, status: 'PLANNED' }) }));
    expect(cardB.attention.items).toEqual([expect.objectContaining({ phaseId: b2.body.id, type: 'PHASE' })]);
    expect(dashboard.body.recentValidations).toEqual([expect.objectContaining({ projectId: projectA.body.id, phaseId: a1.body.id, projectName: 'Project A' })]);
    expect(dashboard.body.attentionItems.every((item: { projectId: string }) => [projectA.body.id, projectB.body.id].includes(item.projectId))).toBe(true);
    expect((await request(app.getHttpServer()).get(`/dashboard?projectId=${projectB.body.id}`).expect(200)).body.projects).toHaveLength(1);
  });

  it('returns an empty dashboard when no project exists', async () => {
    const dashboard = await request(app.getHttpServer()).get('/dashboard').expect(200);
    expect(dashboard.body.summary.totalProjects).toBe(0);
    expect(dashboard.body.projects).toEqual([]);
    expect(dashboard.body.recentValidations).toEqual([]);
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});