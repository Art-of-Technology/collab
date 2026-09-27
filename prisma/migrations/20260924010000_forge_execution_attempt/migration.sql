CREATE TABLE "ForgeExecutionAttempt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "issueNumber" INTEGER NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "repositoryId" INTEGER NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "retryOf" TEXT,
  "state" TEXT NOT NULL DEFAULT 'PREPARING',
  "safeToRetry" BOOLEAN NOT NULL DEFAULT false,
  "sourceFingerprint" TEXT NOT NULL,
  "readyFingerprint" TEXT,
  "memorySha" TEXT NOT NULL,
  "deploymentKey" TEXT NOT NULL,
  "configuredModel" TEXT NOT NULL,
  "deploymentRevision" TEXT NOT NULL,
  "deploymentIdentity" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "workerId" TEXT,
  "providerRunId" TEXT,
  "heartbeatAt" TIMESTAMP(3),
  "cancelRequestedAt" TIMESTAMP(3),
  "cancelAcknowledgedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "result" TEXT,
  "stopReason" TEXT,
  "receipt" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ForgeExecutionAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ForgeExecutionAttempt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ForgeExecutionAttempt_state_check" CHECK ("state" IN ('PREPARING','READY','LAUNCHING','RUNNING','UNKNOWN','CANCEL_REQUESTED','CANCELLED','FAILED','REVIEW_REQUIRED','RESULT_MISSING'))
);
CREATE INDEX "ForgeExecutionAttempt_projectId_issueNumber_createdAt_idx" ON "ForgeExecutionAttempt"("projectId","issueNumber","createdAt");
CREATE INDEX "ForgeExecutionAttempt_state_heartbeatAt_idx" ON "ForgeExecutionAttempt"("state","heartbeatAt");
CREATE UNIQUE INDEX "ForgeExecutionAttempt_active_issue_key" ON "ForgeExecutionAttempt"("projectId","issueNumber")
WHERE "state" IN ('PREPARING','READY','LAUNCHING','RUNNING','UNKNOWN','CANCEL_REQUESTED');

CREATE UNIQUE INDEX "ForgeExecutionAttempt_projectId_issueNumber_generation_key" ON "ForgeExecutionAttempt"("projectId","issueNumber","generation");
