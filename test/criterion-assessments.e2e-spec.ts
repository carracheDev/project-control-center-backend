import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Criterion assessments (e2e)', () => {
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
    await prisma.criterionAssessment.deleteMany();
    await prisma.evidence.deleteMany();
    await prisma.criterion.deleteMany();
    await prisma.phase.deleteMany();
    await prisma.project.deleteMany();
  });

  it('manages assessment states, evidence references and preserves phase status', async () => {
    const project = await request(app.getHttpServer()).post('/projects').send({ name: 'Assessment project' }).expect(201);
    const phase = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: 'Discovery', order: 1 }).expect(201);
    const otherProject = await request(app.getHttpServer()).post('/projects').send({ name: 'Other project' }).expect(201);
    const otherPhase = await request(app.getHttpServer()).post(`/projects/${otherProject.body.id}/phases`).send({ name: 'Other phase', order: 1 }).expect(201);
    const criterion = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/criteria`).send({ name: 'Problem defined', required: true, order: 1 }).expect(201);
    const otherCriterion = await request(app.getHttpServer()).post(`/phases/${otherPhase.body.id}/criteria`).send({ name: 'Other criterion', required: true, order: 1 }).expect(201);

    const initialGating = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    expect(initialGating.body.blockers).toContain('Problem defined');

    const pending = await request(app.getHttpServer()).post(`/criteria/${criterion.body.id}/assessment`).send({}).expect(201);
    expect(pending.body.status).toBe('PENDING');
    expect(pending.body.assessedAt).toBeNull();
    const pendingGating = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    expect(pendingGating.body.blockers).toContain('Problem defined');
    await request(app.getHttpServer()).post(`/criteria/${criterion.body.id}/assessment`).send({}).expect(409);

    await request(app.getHttpServer()).patch(`/criterion-assessments/${pending.body.id}`).send({ status: 'SATISFIED', assessedBy: 'reviewer', note: 'Reviewed explicitly' }).expect(200);
    const satisfiedGating = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    expect(satisfiedGating.body.conditions).toContainEqual(expect.objectContaining({ code: `CRITERION_REQUIRED_${criterion.body.id}`, satisfied: true, reason: 'Critère évalué comme satisfait.' }));
    expect(satisfiedGating.body.blockers).not.toContain('Problem defined');

    const evidence = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/evidence`).send({ title: 'Interview note', type: 'NOTE', source: 'manual', note: 'Observed evidence' }).expect(201);
    await request(app.getHttpServer()).post(`/evidence/${evidence.body.id}/verify`).send({}).expect(201);
    await request(app.getHttpServer()).patch(`/criterion-assessments/${pending.body.id}`).send({ evidenceId: evidence.body.id }).expect(200);
    const stillSatisfied = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    expect(stillSatisfied.body.canValidate).toBe(true);

    await request(app.getHttpServer()).delete(`/evidence/${evidence.body.id}`).expect(200);
    const preservedAssessment = await request(app.getHttpServer()).get(`/criteria/${criterion.body.id}/assessment`).expect(200);
    expect(preservedAssessment.body.evidenceId).toBeNull();

    const otherEvidence = await request(app.getHttpServer()).post(`/phases/${otherPhase.body.id}/evidence`).send({ title: 'Other note', type: 'NOTE', source: 'manual', note: 'Other phase' }).expect(201);
    await request(app.getHttpServer()).patch(`/criterion-assessments/${pending.body.id}`).send({ evidenceId: otherEvidence.body.id }).expect(422);
    await request(app.getHttpServer()).patch(`/criterion-assessments/${pending.body.id}`).send({ status: 'NOT_SATISFIED' }).expect(200);
    const notSatisfiedGating = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    expect(notSatisfiedGating.body.blockers).toContain('Problem defined');

    await request(app.getHttpServer()).delete(`/criterion-assessments/${pending.body.id}`).expect(200);
    await request(app.getHttpServer()).get(`/criteria/${criterion.body.id}/assessment`).expect(200);
    await request(app.getHttpServer()).get(`/criteria/${otherCriterion.body.id}/assessment`).expect(200);
    expect((await prisma.phase.findUnique({ where: { id: phase.body.id } }))?.status).toBe('PLANNED');
  });

  it('rejects missing criteria and assessments', async () => {
    await request(app.getHttpServer()).get('/criteria/missing/assessment').expect(404);
    await request(app.getHttpServer()).patch('/criterion-assessments/missing').send({ status: 'SATISFIED' }).expect(404);
    await request(app.getHttpServer()).delete('/criterion-assessments/missing').expect(404);
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});