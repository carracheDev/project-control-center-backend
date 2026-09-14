import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Official phase validation (e2e)', () => {
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
    await prisma.criterion.deleteMany();
    await prisma.phase.deleteMany();
    await prisma.project.deleteMany();
  });

  it('validates only through the official endpoint and preserves the gating snapshot', async () => {
    const project = await request(app.getHttpServer()).post('/projects').send({ name: 'Validation project' }).expect(201);
    const phase = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: 'Discovery', order: 1 }).expect(201);
    const criterion = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/criteria`).send({ name: 'Problem defined', required: true, order: 1 }).expect(201);

    await request(app.getHttpServer()).patch(`/phases/${phase.body.id}`).send({ status: 'VALIDATED' }).expect(400);
    expect((await request(app.getHttpServer()).get(`/phases/${phase.body.id}`).expect(200)).body.status).toBe('PLANNED');

    const blocked = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/validate`).send({ validatedBy: 'reviewer' }).expect(422);
    expect(blocked.body.message).toBe('Phase cannot be validated');
    expect(blocked.body.blockers).toContain('Problem defined');
    expect((await request(app.getHttpServer()).get(`/phases/${phase.body.id}`).expect(200)).body.status).toBe('PLANNED');

    const assessment = await request(app.getHttpServer()).post(`/criteria/${criterion.body.id}/assessment`).send({ status: 'SATISFIED', assessedBy: 'reviewer' }).expect(201);
    expect(assessment.body.status).toBe('SATISFIED');
    const gating = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
    expect(gating.body.canValidate).toBe(true);

    const validated = await request(app.getHttpServer()).post(`/phases/${phase.body.id}/validate`).send({ validatedBy: 'reviewer', note: 'Exit conditions checked' }).expect(201);
    expect(validated.body.phase.status).toBe('VALIDATED');
    expect(validated.body.validation).toEqual(expect.objectContaining({ validatedBy: 'reviewer', note: 'Exit conditions checked' }));
    expect(validated.body.validation.gatingSnapshot).toEqual({
      canValidate: true,
      blockers: [],
      satisfiedConditions: ['Problem defined'],
      conditions: [expect.objectContaining({ code: `CRITERION_REQUIRED_${criterion.body.id}`, satisfied: true })],
      evaluatedAt: expect.any(String),
    });

    const phaseAfterValidation = await request(app.getHttpServer()).get(`/phases/${phase.body.id}`).expect(200);
    expect(phaseAfterValidation.body.status).toBe('VALIDATED');
    const history = await request(app.getHttpServer()).get(`/phases/${phase.body.id}/validations`).expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].gatingSnapshot.canValidate).toBe(true);
    await request(app.getHttpServer()).get(`/phase-validations/${history.body[0].id}`).expect(200);
    await request(app.getHttpServer()).patch(`/phase-validations/${history.body[0].id}`).send({ note: 'Mutated' }).expect(404);
    await request(app.getHttpServer()).delete(`/phase-validations/${history.body[0].id}`).expect(404);

    await request(app.getHttpServer()).post(`/phases/${phase.body.id}/validate`).send({}).expect(409);
    expect((await request(app.getHttpServer()).get(`/phases/${phase.body.id}/validations`).expect(200)).body).toHaveLength(1);
  });

  it('keeps Readiness and Gating available after validation', async () => {
    const project = await request(app.getHttpServer()).post('/projects').send({ name: 'Diagnostics project' }).expect(201);
    const phase = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: 'Phase', order: 1 }).expect(201);
    await request(app.getHttpServer()).get(`/phases/${phase.body.id}/readiness`).expect(200);
    await request(app.getHttpServer()).get(`/phases/${phase.body.id}/gating`).expect(200);
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});