import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Project decisions (e2e)', () => {
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
    await prisma.projectDecision.deleteMany();
    await prisma.phaseValidation.deleteMany();
    await prisma.criterionAssessment.deleteMany();
    await prisma.evidence.deleteMany();
    await prisma.phase.deleteMany();
    await prisma.project.deleteMany();
  });

  it('creates immutable GO/PIVOT/NO_GO history without changing workflow data', async () => {
    const project = await request(app.getHttpServer()).post('/projects').send({ name: 'Decision project' }).expect(201);
    const phase = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: 'Discovery', order: 1 }).expect(201);
    const beforeGating = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    const beforeReadiness = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/readiness`).expect(200);

    const go = await request(app.getHttpServer()).post(`/projects/${project.body.id}/decisions`).send({ type: 'GO', rationale: 'Proceed with the current direction', nextSteps: 'Prepare delivery', decidedBy: 'Lead' }).expect(201);
    await request(app.getHttpServer()).post(`/projects/${project.body.id}/decisions`).send({ type: 'PIVOT', rationale: 'Adjust the target segment' }).expect(201);
    await request(app.getHttpServer()).post(`/projects/${project.body.id}/decisions`).send({ type: 'NO_GO', rationale: 'Stop this direction' }).expect(201);

    expect(go.body.type).toBe('GO');
    expect(go.body.decidedAt).toEqual(expect.any(String));
    expect(go.body.reportSnapshot.projectId).toBe(project.body.id);
    expect(go.body.reportSnapshot.phaseSummary.total).toBe(1);
    expect((await request(app.getHttpServer()).get(`/phases/${phase.body.id}`).expect(200)).body.status).toBe('PLANNED');
    expect((await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200)).body).toEqual({ ...beforeGating.body, evaluatedAt: expect.any(String) });
    expect((await request(app.getHttpServer()).get(`/phases/${phase.body.id}/readiness`).expect(200)).body).toEqual({ ...beforeReadiness.body, evaluatedAt: expect.any(String) });

    const history = await request(app.getHttpServer()).get(`/projects/${project.body.id}/decisions`).expect(200);
    expect(history.body).toHaveLength(3);
    await request(app.getHttpServer()).get(`/project-decisions/${go.body.id}`).expect(200);
    await request(app.getHttpServer()).patch(`/project-decisions/${go.body.id}`).send({ rationale: 'Changed' }).expect(404);
    await request(app.getHttpServer()).delete(`/project-decisions/${go.body.id}`).expect(404);
  });

  it('validates input and isolates projects', async () => {
    const projectA = await request(app.getHttpServer()).post('/projects').send({ name: 'Project A' }).expect(201);
    const projectB = await request(app.getHttpServer()).post('/projects').send({ name: 'Project B' }).expect(201);
    await request(app.getHttpServer()).post(`/projects/${projectA.body.id}/decisions`).send({ type: 'INVALID', rationale: 'No' }).expect(400);
    await request(app.getHttpServer()).post(`/projects/${projectA.body.id}/decisions`).send({ type: 'GO', rationale: '   ' }).expect(400);
    await request(app.getHttpServer()).post('/projects/missing/decisions').send({ type: 'GO', rationale: 'Decision' }).expect(404);
    await request(app.getHttpServer()).post(`/projects/${projectA.body.id}/decisions`).send({ type: 'GO', rationale: 'Only A' }).expect(201);
    expect((await request(app.getHttpServer()).get(`/projects/${projectB.body.id}/decisions`).expect(200)).body).toEqual([]);
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});