-- CreateEnum
CREATE TYPE "BoardGenerationStatus" AS ENUM ('PENDING', 'GENERATING_MILESTONES', 'GENERATING_EPICS', 'GENERATING_STORIES', 'GENERATING_TASKS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "BoardGenerationJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "projectType" TEXT,
    "teamSize" TEXT,
    "status" "BoardGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "boardData" JSONB,
    "boardId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardGenerationJob_workspaceId_idx" ON "BoardGenerationJob"("workspaceId");
CREATE INDEX "BoardGenerationJob_userId_idx" ON "BoardGenerationJob"("userId");
CREATE INDEX "BoardGenerationJob_status_idx" ON "BoardGenerationJob"("status"); 