-- CreateTable
CREATE TABLE "ProjectDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "nextSteps" TEXT,
    "decidedBy" TEXT,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportSnapshot" JSONB NOT NULL,
    CONSTRAINT "ProjectDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectDecision_projectId_idx" ON "ProjectDecision"("projectId");

-- CreateIndex
CREATE INDEX "ProjectDecision_decidedAt_idx" ON "ProjectDecision"("decidedAt");
