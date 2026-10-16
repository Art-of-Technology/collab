-- CreateTable
CREATE TABLE "AgentRegistration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "labelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentHandoff" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'handoff',
    "content" TEXT NOT NULL,
    "recipientNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "labelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requestAck" BOOLEAN NOT NULL DEFAULT false,
    "senderId" TEXT,
    "claimedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "afterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentReceipt" (
    "handoffId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),
    "ackAt" TIMESTAMP(3),

    CONSTRAINT "AgentReceipt_pkey" PRIMARY KEY ("handoffId","agentId")
);

-- CreateIndex
CREATE INDEX "AgentRegistration_userId_workspaceId_idx" ON "AgentRegistration"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRegistration_workspaceId_name_key" ON "AgentRegistration"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "AgentHandoff_workspaceId_createdAt_id_idx" ON "AgentHandoff"("workspaceId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AgentHandoff_issueId_idx" ON "AgentHandoff"("issueId");

-- CreateIndex
CREATE INDEX "AgentHandoff_claimedById_status_idx" ON "AgentHandoff"("claimedById", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentHandoff_workspaceId_sourceKey_key" ON "AgentHandoff"("workspaceId", "sourceKey");

-- CreateIndex
CREATE INDEX "AgentReceipt_agentId_idx" ON "AgentReceipt"("agentId");

-- AddForeignKey
ALTER TABLE "AgentRegistration" ADD CONSTRAINT "AgentRegistration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRegistration" ADD CONSTRAINT "AgentRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "AgentRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "AgentRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_afterId_fkey" FOREIGN KEY ("afterId") REFERENCES "AgentHandoff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentReceipt" ADD CONSTRAINT "AgentReceipt_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "AgentHandoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentReceipt" ADD CONSTRAINT "AgentReceipt_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

