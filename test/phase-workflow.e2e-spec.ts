import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Phase workflow dependencies (e2e)', () => {
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
    await prisma.phase.deleteMany();
    await prisma.project.deleteMany();
  });

  it('locks dependent phases and unlocks only the immediate next phase', async () => {
    const project = await request(app.getHttpServer()).post('/projects').send({ name: 'Workflow project' }).expect(201);
    const phaseOne = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: 'Phase 1', order: 1 }).expect(201);
    const phaseTwo = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: 'Phase 2', order: 2 }).expect(201);
    const phaseThree = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: 'Phase 3', order: 3 }).expect(201);

    expect(phaseOne.body.status).toBe('PLANNED');
    expect(phaseTwo.body.status).toBe('LOCKED');
    expect(phaseThree.body.status).toBe('LOCKED');
    expect((await request(app.getHttpServer()).get(`/phases/${phaseThree.body.id}/workflow`).expect(200)).body).toEqual(expect.objectContaining({ locked: true, accessible: false, reason: 'La phase précédente doit être validée.', previousPhase: expect.objectContaining({ id: phaseTwo.body.id, status: 'LOCKED' }) }));

    await request(app.getHttpServer()).post(`/phases/${phaseOne.body.id}/validate`).send({}).expect(201);
    expect((await request(app.getHttpServer()).get(`/phases/${phaseOne.body.id}`).expect(200)).body.status).toBe('VALIDATED');
    expect((await request(app.getHttpServer()).get(`/phases/${phaseTwo.body.id}`).expect(200)).body.status).toBe('PLANNED');
    expect((await request(app.getHttpServer()).get(`/phases/${phaseThree.body.id}`).expect(200)).body.status).toBe('LOCKED');

    await request(app.getHttpServer()).patch(`/phases/${phaseThree.body.id}`).send({ status: 'IN_PROGRESS' }).expect(400);
    expect((await request(app.getHttpServer()).get(`/phases/${phaseThree.body.id}`).expect(200)).body.status).toBe('LOCKED');

    await request(app.getHttpServer()).post(`/phases/${phaseTwo.body.id}/validate`).send({}).expect(201);
    expect((await request(app.getHttpServer()).get(`/phases/${phaseTwo.body.id}`).expect(200)).body.status).toBe('VALIDATED');
    expect((await request(app.getHttpServer()).get(`/phases/${phaseThree.body.id}`).expect(200)).body.status).toBe('PLANNED');

    await request(app.getHttpServer()).post(`/phases/${phaseThree.body.id}/validate`).send({}).expect(201);
    expect((await request(app.getHttpServer()).get(`/phases/${phaseThree.body.id}`).expect(200)).body.status).toBe('VALIDATED');
  });

  it('keeps projects isolated and supports a single phase project', async () => {
    const projectA = await request(app.getHttpServer()).post('/projects').send({ name: 'Project A' }).expect(201);
    const projectB = await request(app.getHttpServer()).post('/projects').send({ name: 'Project B' }).expect(201);
    const phaseA = await request(app.getHttpServer()).post(`/projects/${projectA.body.id}/phases`).send({ name: 'A first', order: 1 }).expect(201);
    const phaseBOne = await request(app.getHttpServer()).post(`/projects/${projectB.body.id}/phases`).send({ name: 'B first', order: 1 }).expect(201);
    const phaseBTwo = await request(app.getHttpServer()).post(`/projects/${projectB.body.id}/phases`).send({ name: 'B second', order: 2 }).expect(201);

    expect(phaseBTwo.body.status).toBe('LOCKED');
    await request(app.getHttpServer()).post(`/phases/${phaseA.body.id}/validate`).send({}).expect(201);
    expect((await request(app.getHttpServer()).get(`/phases/${phaseBTwo.body.id}`).expect(200)).body.status).toBe('LOCKED');
    expect((await request(app.getHttpServer()).get(`/phases/${phaseBOne.body.id}/workflow`).expect(200)).body.previousPhase).toBeNull();
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});