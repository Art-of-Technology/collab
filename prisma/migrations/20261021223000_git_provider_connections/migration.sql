-- CreateTable
CREATE TABLE "GitConnection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "connectedById" TEXT,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "repositoryPath" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "credentials" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitConnectionActivity" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "state" TEXT,

    CONSTRAINT "GitConnectionActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitConnection_projectId_idx" ON "GitConnection"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "GitConnection_projectId_provider_baseUrl_externalId_key" ON "GitConnection"("projectId", "provider", "baseUrl", "externalId");

-- CreateIndex
CREATE INDEX "GitConnectionActivity_connectionId_date_idx" ON "GitConnectionActivity"("connectionId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GitConnectionActivity_connectionId_kind_externalId_key" ON "GitConnectionActivity"("connectionId", "kind", "externalId");

-- AddForeignKey
ALTER TABLE "GitConnection" ADD CONSTRAINT "GitConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitConnection" ADD CONSTRAINT "GitConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitConnectionActivity" ADD CONSTRAINT "GitConnectionActivity_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GitConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

