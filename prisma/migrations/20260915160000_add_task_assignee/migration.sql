ALTER TABLE "Task" ADD COLUMN "assigneeId" TEXT;

CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;