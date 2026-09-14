import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Projects and phases (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let request: (_server: unknown) => E2eAgent;
  let auth: E2eAuthContext;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    auth = await createTestAuthContext(app, prisma);
    request = () => auth.admin;
  });

  beforeEach(async () => {
    await prisma.phase.deleteMany();
    await prisma.project.deleteMany();
  });

  it('creates and reads a project', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .send({ name: 'Validation project', description: 'A generic project' })
      .expect(201);

    expect(createResponse.body.name).toBe('Validation project');

    await request(app.getHttpServer())
      .get(`/projects/${createResponse.body.id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.phases).toEqual([]);
      });
  });

  it('rejects VALIDATED as a CRUD input', async () => {
    await request(app.getHttpServer())
      .post('/projects')
      .send({ name: 'Validation project' })
      .expect(201)
      .then(async ({ body }) => {
        await request(app.getHttpServer())
          .post(`/projects/${body.id}/phases`)
          .send({ name: 'Phase one', order: 1, status: 'VALIDATED' })
          .expect(400);
      });
  });

  it('creates phases in order and enforces project-local uniqueness', async () => {
    const firstProject = await request(app.getHttpServer())
      .post('/projects')
      .send({ name: 'First project' })
      .expect(201);
    const secondProject = await request(app.getHttpServer())
      .post('/projects')
      .send({ name: 'Second project' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${firstProject.body.id}/phases`)
      .send({ name: 'Second phase', order: 2 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/projects/${firstProject.body.id}/phases`)
      .send({ name: 'First phase', order: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/projects/${firstProject.body.id}/phases`)
      .send({ name: 'Duplicate phase', order: 1 })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/projects/${secondProject.body.id}/phases`)
      .send({ name: 'First phase', order: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/projects/${firstProject.body.id}/phases`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.map((phase: { order: number }) => phase.order)).toEqual([1, 2]);
      });
  });

  it('updates and deletes projects and phases', async () => {
    const project = await request(app.getHttpServer())
      .post('/projects')
      .send({ name: 'Project to update' })
      .expect(201);
    const phase = await request(app.getHttpServer())
      .post(`/projects/${project.body.id}/phases`)
      .send({ name: 'Phase to update', order: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/projects/${project.body.id}`)
      .send({ name: 'Updated project' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/phases/${phase.body.id}`)
      .send({ name: 'Updated phase' })
      .expect(200);
    await request(app.getHttpServer()).delete(`/phases/${phase.body.id}`).expect(200);
    await request(app.getHttpServer()).delete(`/projects/${project.body.id}`).expect(200);
    await request(app.getHttpServer()).get(`/projects/${project.body.id}`).expect(404);
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});
