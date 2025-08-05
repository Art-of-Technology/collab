-- CreateTable
CREATE TABLE "TaskFollower" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskFollower_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskFollower_taskId_idx" ON "TaskFollower"("taskId");

-- CreateIndex
CREATE INDEX "TaskFollower_userId_idx" ON "TaskFollower"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskFollower_taskId_userId_key" ON "TaskFollower"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "TaskFollower" ADD CONSTRAINT "TaskFollower_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFollower" ADD CONSTRAINT "TaskFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
