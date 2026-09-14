-- CreateTable
CREATE TABLE "PhaseValidation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phaseId" TEXT NOT NULL,
    "validatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedBy" TEXT,
    "note" TEXT,
    "gatingSnapshot" JSONB NOT NULL,
    CONSTRAINT "PhaseValidation_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PhaseValidation_phaseId_idx" ON "PhaseValidation"("phaseId");
