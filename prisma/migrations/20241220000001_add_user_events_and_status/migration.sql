-- CreateEnum for event types
-- First, check if the taskCommentId column exists in Notification table
-- If it doesn't exist, we'll add it later
CREATE TYPE "EventType" AS ENUM (
    'TASK_START',
    'TASK_PAUSE', 
    'TASK_STOP',
    'TASK_COMPLETE',
    'LUNCH_START',
    'LUNCH_END',
    'BREAK_START',
    'BREAK_END',
    'MEETING_START',
    'MEETING_END',
    'TRAVEL_START',
    'TRAVEL_END',
    'REVIEW_START',
    'REVIEW_END',
    'RESEARCH_START',
    'RESEARCH_END',
    'OFFLINE',
    'AVAILABLE'
);

-- CreateEnum for user status
CREATE TYPE "UserStatusType" AS ENUM (
    'WORKING',
    'LUNCH',
    'BREAK',
    'MEETING',
    'TRAVEL',
    'REVIEW',
    'RESEARCH',
    'OFFLINE',
    'AVAILABLE'
);

-- CreateTable UserEvent
CREATE TABLE "UserEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "taskId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable UserStatus  
CREATE TABLE "UserStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStatus" "UserStatusType" NOT NULL DEFAULT 'AVAILABLE',
    "currentTaskId" TEXT,
    "statusStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusText" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "autoEndAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserEvent_userId_idx" ON "UserEvent"("userId");
CREATE INDEX "UserEvent_taskId_idx" ON "UserEvent"("taskId");
CREATE INDEX "UserEvent_eventType_idx" ON "UserEvent"("eventType");
CREATE INDEX "UserEvent_startedAt_idx" ON "UserEvent"("startedAt");
CREATE UNIQUE INDEX "UserStatus_userId_key" ON "UserStatus"("userId");

-- AddForeignKey
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserStatus" ADD CONSTRAINT "UserStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserStatus" ADD CONSTRAINT "UserStatus_currentTaskId_fkey" FOREIGN KEY ("currentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE; 