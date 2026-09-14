import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Authentication and project RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auth: E2eAuthContext;
  let admin: E2eAgent;
  let manager: E2eAgent;
  let viewer: E2eAgent;
  let managerUserId: string;
  let viewerUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    auth = await createTestAuthContext(app, prisma);
    admin = auth.admin;
    manager = auth.manager;
    viewer = auth.viewer;
    managerUserId = auth.userIds[1];
    viewerUserId = auth.userIds[2];
  });

  beforeEach(async () => {
    await prisma.project.deleteMany();
  });

  it('rejects unauthenticated requests and authenticates through the real login cookie', async () => {
    await request(app.getHttpServer()).get('/projects').expect(401);
    await admin.get('/auth/me').expect(200).expect(({ body }) => {
      expect(body.globalRole).toBe('ADMIN');
      expect(body).not.toHaveProperty('passwordHash');
    });
  });

  it('allows an admin to see all projects', async () => {
    await prisma.project.createMany({ data: [{ name: 'Admin A' }, { name: 'Admin B' }] });
    await admin.get('/projects').expect(200).expect(({ body }) => expect(body).toHaveLength(2));
  });

  it('creates a manager-owned project and grants its manager access', async () => {
    const response = await manager.post('/projects').send({ name: 'Manager project' }).expect(201);
    const membership = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: response.body.id, userId: managerUserId } } });
    expect(membership?.role).toBe('PROJECT_MANAGER');
    await manager.get(`/projects/${response.body.id}`).expect(200);
  });

  it('allows a viewer to read but not mutate a project', async () => {
    const project = await admin.post('/projects').send({ name: 'Viewer project' }).expect(201);
    await prisma.projectMember.create({ data: { projectId: project.body.id, userId: viewerUserId, role: 'VIEWER' } });
    await viewer.get(`/projects/${project.body.id}`).expect(200);
    await viewer.patch(`/projects/${project.body.id}`).send({ name: 'Denied' }).expect(403);
  });

  it('isolates projects between memberships', async () => {
    const projectA = await manager.post('/projects').send({ name: 'Project A' }).expect(201);
    const projectB = await admin.post('/projects').send({ name: 'Project B' }).expect(201);
    await admin.post(`/projects/${projectB.body.id}/members`).send({ userId: viewerUserId, role: 'VIEWER' }).expect(201);
    await manager.get(`/projects/${projectA.body.id}`).expect(200);
    await manager.get(`/projects/${projectB.body.id}`).expect(403);
  });

  it('prevents child-resource IDOR across projects', async () => {
    const projectA = await manager.post('/projects').send({ name: 'Project A' }).expect(201);
    const projectB = await admin.post('/projects').send({ name: 'Project B' }).expect(201);
    const phaseB = await admin.post(`/projects/${projectB.body.id}/phases`).send({ name: 'Phase B', order: 1 }).expect(201);
    const taskB = await admin.post(`/phases/${phaseB.body.id}/tasks`).send({ title: 'Task B' }).expect(201);
    await manager.get(`/tasks/${taskB.body.id}`).expect(403);
    await manager.get(`/phases/${phaseB.body.id}`).expect(403);
    await manager.get(`/projects/${projectA.body.id}`).expect(200);
  });

  it('prevents viewers from validating phases or creating decisions', async () => {
    const project = await admin.post('/projects').send({ name: 'Read-only project' }).expect(201);
    const phase = await admin.post(`/projects/${project.body.id}/phases`).send({ name: 'Phase', order: 1 }).expect(201);
    await prisma.projectMember.create({ data: { projectId: project.body.id, userId: viewerUserId, role: 'VIEWER' } });
    await viewer.post(`/phases/${phase.body.id}/validate`).send({}).expect(403);
    await viewer.post(`/projects/${project.body.id}/decisions`).send({ type: 'GO', rationale: 'Denied' }).expect(403);
  });

  it('uploads and downloads evidence through controlled storage and records an audit event', async () => {
    const project = await admin.post('/projects').send({ name: 'Upload project' }).expect(201);
    const phase = await admin.post(`/projects/${project.body.id}/phases`).send({ name: 'Evidence phase', order: 1 }).expect(201);
    const upload = await admin.post(`/phases/${phase.body.id}/evidence/upload`).field('title', 'Research note').field('type', 'NOTE').field('source', 'UPLOAD').attach('file', Buffer.from('controlled evidence'), { filename: 'research.txt', contentType: 'text/plain' }).expect(201);
    expect(upload.body.filePath).toMatch(/^evidence[\\/]/);
    expect(upload.body.originalFileName).toBe('research.txt');
    await admin.get(`/evidence/${upload.body.id}/download`).expect(200);
    await admin.delete(`/evidence/${upload.body.id}`).expect(200);
    await admin.get('/audit-logs').expect(200).expect(({ body }) => expect(body.some((entry: { entityId: string }) => entry.entityId === upload.body.id)).toBe(true));
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});
