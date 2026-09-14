import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupTestAuthContext, createTestAuthContext, type E2eAgent, type E2eAuthContext } from './helpers/auth.js';

describe('Questionnaires, interviews and responses (e2e)', () => {
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

  async function createPhase(projectName: string) {
    const project = await request(app.getHttpServer()).post('/projects').send({ name: projectName }).expect(201);
    const phase = await request(app.getHttpServer()).post(`/projects/${project.body.id}/phases`).send({ name: `${projectName} phase`, order: 1 }).expect(201);
    return phase.body as { id: string; projectId: string };
  }

  it('runs a complete questionnaire and interview journey', async () => {
    const phase = await createPhase('Interview project');
    const questionnaire = await request(app.getHttpServer())
      .post(`/phases/${phase.id}/questionnaires`)
      .send({ name: 'Discovery guide', description: 'Structured interview', version: 1, status: 'ACTIVE' })
      .expect(201);
    const textQuestion = await request(app.getHttpServer())
      .post(`/questionnaires/${questionnaire.body.id}/questions`)
      .send({ text: 'What is the main need?', type: 'LONG_TEXT', required: true, order: 1 })
      .expect(201);
    const choiceQuestion = await request(app.getHttpServer())
      .post(`/questionnaires/${questionnaire.body.id}/questions`)
      .send({ text: 'How urgent is it?', type: 'SINGLE_CHOICE', required: true, order: 2 })
      .expect(201);
    await request(app.getHttpServer()).post(`/questions/${choiceQuestion.body.id}/options`).send({ label: 'High', value: 'high', order: 1 }).expect(201);
    await request(app.getHttpServer()).post(`/questions/${choiceQuestion.body.id}/options`).send({ label: 'Low', value: 'low', order: 2 }).expect(201);
    await request(app.getHttpServer()).get(`/questionnaires/${questionnaire.body.id}`).expect(200);

    const interview = await request(app.getHttpServer())
      .post(`/phases/${phase.id}/interviews`)
      .send({ questionnaireId: questionnaire.body.id, respondentName: 'Alex Martin', respondentRole: 'Product lead', organization: 'Example org' })
      .expect(201);
    await request(app.getHttpServer()).post(`/interviews/${interview.body.id}/responses`).send({ questionId: textQuestion.body.id, value: 'A clear need' }).expect(201);
    const choiceResponse = await request(app.getHttpServer()).post(`/interviews/${interview.body.id}/responses`).send({ questionId: choiceQuestion.body.id, value: 'high' }).expect(201);
    await request(app.getHttpServer()).get(`/interviews/${interview.body.id}/responses`).expect(200);
    await request(app.getHttpServer()).patch(`/responses/${choiceResponse.body.id}`).send({ value: 'low' }).expect(200);
    const completed = await request(app.getHttpServer()).patch(`/interviews/${interview.body.id}`).send({ status: 'COMPLETED' }).expect(200);

    expect(completed.body.status).toBe('COMPLETED');
    const persistedPhase = await prisma.phase.findUnique({ where: { id: phase.id } });
    expect(persistedPhase?.status).toBe('PLANNED');
  });

  it('rejects cross-phase questionnaires and questions', async () => {
    const phaseA = await createPhase('Phase A');
    const phaseB = await createPhase('Phase B');
    const questionnaireA = await request(app.getHttpServer()).post(`/phases/${phaseA.id}/questionnaires`).send({ name: 'A guide', version: 1 }).expect(201);
    const questionnaireB = await request(app.getHttpServer()).post(`/phases/${phaseB.id}/questionnaires`).send({ name: 'B guide', version: 1 }).expect(201);
    const questionA = await request(app.getHttpServer()).post(`/questionnaires/${questionnaireA.body.id}/questions`).send({ text: 'A question', type: 'TEXT', required: true, order: 1 }).expect(201);

    await request(app.getHttpServer()).post(`/phases/${phaseA.id}/interviews`).send({ questionnaireId: questionnaireB.body.id, respondentName: 'Invalid' }).expect(422);
    const interview = await request(app.getHttpServer()).post(`/phases/${phaseA.id}/interviews`).send({ questionnaireId: questionnaireA.body.id, respondentName: 'Valid' }).expect(201);
    await request(app.getHttpServer()).post(`/interviews/${interview.body.id}/responses`).send({ questionId: questionA.body.id, value: 'valid' }).expect(201);
    await request(app.getHttpServer()).post(`/interviews/${interview.body.id}/responses`).send({ questionId: 'missing-question', value: 'invalid' }).expect(404);
  });

  it('rejects completion while a required answer is missing', async () => {
    const phase = await createPhase('Incomplete interview project');
    const questionnaire = await request(app.getHttpServer()).post(`/phases/${phase.id}/questionnaires`).send({ name: 'Required guide', version: 1 }).expect(201);
    await request(app.getHttpServer()).post(`/questionnaires/${questionnaire.body.id}/questions`).send({ text: 'Required question', type: 'TEXT', required: true, order: 1 }).expect(201);
    const interview = await request(app.getHttpServer()).post(`/phases/${phase.id}/interviews`).send({ questionnaireId: questionnaire.body.id, respondentName: 'Incomplete' }).expect(201);
    await request(app.getHttpServer()).patch(`/interviews/${interview.body.id}`).send({ status: 'COMPLETED' }).expect(400);
  });

  afterAll(async () => {
    await cleanupTestAuthContext(app, prisma, auth);
  });
});