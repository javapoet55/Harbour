-- Existing Project and Task.projectId tables/foreign key are retained.
-- No task assignments or task data are changed.
CREATE INDEX "Project_userId_deletedAt_updatedAt_idx" ON "Project"("userId", "deletedAt", "updatedAt");
CREATE INDEX "Task_userId_projectId_deletedAt_status_idx" ON "Task"("userId", "projectId", "deletedAt", "status");
