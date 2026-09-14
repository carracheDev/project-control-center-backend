-- CreateTable
CREATE TABLE "CriterionAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "criterionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "evidenceId" TEXT,
    "assessedAt" DATETIME,
    "assessedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CriterionAssessment_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CriterionAssessment_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CriterionAssessment_criterionId_key" ON "CriterionAssessment"("criterionId");

-- CreateIndex
CREATE INDEX "CriterionAssessment_evidenceId_idx" ON "CriterionAssessment"("evidenceId");
