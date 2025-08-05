-- CreateTable
CREATE TABLE "PostFollower" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostFollower_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostFollower_postId_idx" ON "PostFollower"("postId");

-- CreateIndex
CREATE INDEX "PostFollower_userId_idx" ON "PostFollower"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PostFollower_postId_userId_key" ON "PostFollower"("postId", "userId");

-- AddForeignKey
ALTER TABLE "PostFollower" ADD CONSTRAINT "PostFollower_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostFollower" ADD CONSTRAINT "PostFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
