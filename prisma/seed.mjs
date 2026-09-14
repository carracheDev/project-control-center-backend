import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.upsert({
    where: { id: 'demo-project-pcc' },
    update: {},
    create: { id: 'demo-project-pcc', name: 'Projet pilote PCC', description: 'Données DEMO uniquement.' },
  });
  const demoEmail = process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase();
  const demoPassword = process.env.DEMO_ADMIN_PASSWORD;
  if (demoEmail && demoPassword) {
    const admin = await prisma.user.upsert({
      where: { email: demoEmail },
      update: { isActive: true, globalRole: 'ADMIN' },
      create: { email: demoEmail, passwordHash: await argon2.hash(demoPassword), globalRole: 'ADMIN' },
    });
    console.log(`DEMO admin ready: ${admin.email}`);
  } else {
    console.log('DEMO admin skipped: set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD to create it.');
  }
  const phase = await prisma.phase.upsert({
    where: { id: 'demo-phase-discovery' },
    update: {},
    create: { id: 'demo-phase-discovery', projectId: project.id, name: 'Compréhension du problème', order: 1, status: 'PLANNED' },
  });
  const objective = await prisma.objective.upsert({
    where: { id: 'demo-objective-problem' },
    update: {},
    create: { id: 'demo-objective-problem', phaseId: phase.id, name: 'Problème compris', order: 1 },
  });
  const criterion = await prisma.criterion.upsert({
    where: { id: 'demo-criterion-problem' },
    update: {},
    create: { id: 'demo-criterion-problem', phaseId: phase.id, objectiveId: objective.id, name: 'Le problème est clairement défini', required: true, order: 1 },
  });
  await prisma.task.upsert({
    where: { id: 'demo-task-interviews' },
    update: {},
    create: { id: 'demo-task-interviews', phaseId: phase.id, criterionId: criterion.id, title: 'Préparer les interviews', status: 'TODO', priority: 'MEDIUM' },
  });
  await prisma.coverageRequirement.upsert({
    where: { id: 'demo-coverage-problem' },
    update: {},
    create: { id: 'demo-coverage-problem', phaseId: phase.id, objectiveId: objective.id, name: 'Comprendre le problème', minimumInterviews: 3, required: true },
  });
  const questionnaire = await prisma.questionnaire.upsert({
    where: { id: 'demo-questionnaire-discovery' },
    update: {},
    create: { id: 'demo-questionnaire-discovery', phaseId: phase.id, name: 'Guide de découverte DEMO', version: 1, status: 'ACTIVE' },
  });
  const question = await prisma.question.upsert({
    where: { id: 'demo-question-problem' },
    update: {},
    create: { id: 'demo-question-problem', questionnaireId: questionnaire.id, objectiveId: objective.id, text: 'Quel problème rencontrez-vous ?', type: 'LONG_TEXT', required: true, order: 1 },
  });
  const interview = await prisma.interview.upsert({
    where: { id: 'demo-interview-1' },
    update: {},
    create: { id: 'demo-interview-1', phaseId: phase.id, questionnaireId: questionnaire.id, respondentName: 'Répondant DEMO', status: 'PLANNED' },
  });
  await prisma.response.upsert({
    where: { interviewId_questionId: { interviewId: interview.id, questionId: question.id } },
    update: { value: 'Réponse de démonstration' },
    create: { interviewId: interview.id, questionId: question.id, value: 'Réponse de démonstration' },
  });
  const evidence = await prisma.evidence.upsert({
    where: { id: 'demo-evidence-note' },
    update: {},
    create: { id: 'demo-evidence-note', phaseId: phase.id, criterionId: criterion.id, title: 'Note de recherche DEMO', type: 'NOTE', source: 'seed', note: 'Evidence de démonstration.', status: 'PENDING' },
  });
  await prisma.criterionAssessment.upsert({
    where: { criterionId: criterion.id },
    update: {},
    create: { criterionId: criterion.id, status: 'PENDING', evidenceId: evidence.id, note: 'Assessment DEMO en attente.' },
  });
  console.log(`DEMO seed ready: ${project.name}`);
}

main().finally(() => prisma.$disconnect());