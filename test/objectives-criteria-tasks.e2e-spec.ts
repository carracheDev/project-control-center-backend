import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Objectives, criteria and tasks (e2e)', () => {
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
    await prisma.task.deleteMany();
    await prisma.criterion.deleteMany();
    await prisma.objective.deleteMany();
    await prisma.phase.deleteMany();
    await prisma.project.deleteMany();
  });

  async function createProjectAndPhase(name: string) {
    const project = await request(app.getHttpServer()).post('/projects').send({ name }).expect(201);
    const phase = await request(app.getHttpServer())
      .post(`/projects/${project.body.id}/phases`)
      .send({ name: `${name} phase`, order: 1 })
      .expect(201);
    return { project: project.body as { id: string }, phase: phase.body as { id: string } };
  }

  it('supports objective CRUD and rejects a duplicate order in one phase', async () => {
    const { phase } = await createProjectAndPhase('Objectives project');
    const created = await request(app.getHttpServer())
      .post(`/phases/${phase.id}/objectives`)
      .send({ name: 'Define the outcome', description: 'Expected result', order: 1 })
      .expect(201);

    await request(app.getHttpServer()).get(`/phases/${phase.id}/objectives`).expect(200);
    await request(app.getHttpServer()).get(`/objectives/${created.body.id}`).expect(200);
    await request(app.getHttpServer()).patch(`/objectives/${created.body.id}`).send({ name: 'Updated outcome' }).expect(200);
    await request(app.getHttpServer()).post(`/phases/${phase.id}/objectives`).send({ name: 'Duplicate', order: 1 }).expect(409);
    await request(app.getHttpServer()).delete(`/objectives/${created.body.id}`).expect(200);
    await request(app.getHttpServer()).post('/phases/missing/objectives').send({ name: 'Invalid', order: 1 }).expect(404);
  });

  it('supports criteria and rejects objectives from another phase', async () => {
    const first = await createProjectAndPhase('First criteria project');
    const second = await createProjectAndPhase('Second criteria project');
    const objective = await request(app.getHttpServer())
      .post(`/phases/${first.phase.id}/objectives`)
      .send({ name: 'First objective', order: 1 })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post(`/phases/${first.phase.id}/criteria`)
      .send({ objectiveId: objective.body.id, name: 'Required criterion', required: true, order: 1 })
      .expect(201);

    await request(app.getHttpServer()).patch(`/criteria/${created.body.id}`).send({ required: false }).expect(200);
    await request(app.getHttpServer())
      .post(`/phases/${first.phase.id}/criteria`)
      .send({ name: 'Duplicate criterion', required: false, order: 1 })
      .expect(409);
    await request(app.getHttpServer()).delete(`/criteria/${created.body.id}`).expect(200);
    await request(app.getHttpServer())
      .post(`/phases/${second.phase.id}/criteria`)
      .send({ objectiveId: objective.body.id, name: 'Invalid criterion', required: true, order: 1 })
      .expect(422);
    await request(app.getHttpServer()).post('/phases/missing/criteria').send({ name: 'Invalid', required: false, order: 1 }).expect(404);
  });

  it('supports task CRUD, status/priority changes and cross-phase protection', async () => {
    const first = await createProjectAndPhase('First tasks project');
    const second = await createProjectAndPhase('Second tasks project');
    const objective = await request(app.getHttpServer())
      .post(`/phases/${first.phase.id}/objectives`)
      .send({ name: 'Task objective', order: 1 })
      .expect(201);
    const criterion = await request(app.getHttpServer())
      .post(`/phases/${first.phase.id}/criteria`)
      .send({ objectiveId: objective.body.id, name: 'Task criterion', required: true, order: 1 })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post(`/phases/${first.phase.id}/tasks`)
      .send({ objectiveId: objective.body.id, criterionId: criterion.body.id, title: 'Execute the work', status: 'TODO', priority: 'HIGH' })
      .expect(201);

    await request(app.getHttpServer()).get(`/phases/${first.phase.id}/tasks`).expect(200);
    await request(app.getHttpServer()).get(`/tasks/${created.body.id}`).expect(200);
    await request(app.getHttpServer()).patch(`/tasks/${created.body.id}`).send({ status: 'DONE', priority: 'LOW' }).expect(200);
    await request(app.getHttpServer()).post(`/phases/${second.phase.id}/tasks`).send({ objectiveId: objective.body.id, title: 'Invalid objective task' }).expect(422);
    await request(app.getHttpServer()).post(`/phases/${second.phase.id}/tasks`).send({ criterionId: criterion.body.id, title: 'Invalid criterion task' }).expect(422);
    await request(app.getHttpServer()).post('/phases/missing/tasks').send({ title: 'Invalid task' }).expect(404);
    await request(app.getHttpServer()).delete(`/tasks/${created.body.id}`).expect(200);

    const phase = await prisma.phase.findUnique({ where: { id: first.phase.id } });
    expect(phase?.status).toBe('PLANNED');
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});