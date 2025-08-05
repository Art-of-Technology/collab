-- CreateTable
CREATE TABLE "BoardFollower" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardFollower_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardFollower_boardId_idx" ON "BoardFollower"("boardId");

-- CreateIndex
CREATE INDEX "BoardFollower_userId_idx" ON "BoardFollower"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BoardFollower_boardId_userId_key" ON "BoardFollower"("boardId", "userId");

-- AddForeignKey
ALTER TABLE "BoardFollower" ADD CONSTRAINT "BoardFollower_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "TaskBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardFollower" ADD CONSTRAINT "BoardFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
