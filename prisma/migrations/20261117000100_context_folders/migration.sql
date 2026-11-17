-- Context folders and files: a folder belongs to a workspace, or to one project inside it, and may sit
-- inside another folder of the same level. A note's folder is optional, so every existing note keeps
-- showing outside any folder. Deleting a folder sets "deletedAt": the folder and everything in it stay.
-- Two new tables, so the window grants them to the application role:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON "ContextFolder", "ContextFile" TO "<application role>";
-- The new "Note"."folderId" column is on an existing table and needs no grant.
BEGIN;
CREATE TABLE "ContextFolder" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "parentId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deletedById" TEXT,
  CONSTRAINT "ContextFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContextFile" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storageUrl" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deletedById" TEXT,
  CONSTRAINT "ContextFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContextFolder_workspaceId_projectId_idx" ON "ContextFolder"("workspaceId", "projectId");
CREATE INDEX "ContextFolder_parentId_idx" ON "ContextFolder"("parentId");
CREATE INDEX "ContextFolder_deletedAt_idx" ON "ContextFolder"("deletedAt");
CREATE INDEX "ContextFile_folderId_idx" ON "ContextFile"("folderId");
CREATE INDEX "ContextFile_deletedAt_idx" ON "ContextFile"("deletedAt");

-- A folder keeps its parent and its files until Trash is emptied, which this change does not do.
ALTER TABLE "ContextFolder" ADD CONSTRAINT "ContextFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextFolder" ADD CONSTRAINT "ContextFolder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextFolder" ADD CONSTRAINT "ContextFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ContextFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContextFolder" ADD CONSTRAINT "ContextFolder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextFolder" ADD CONSTRAINT "ContextFolder_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContextFile" ADD CONSTRAINT "ContextFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ContextFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContextFile" ADD CONSTRAINT "ContextFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextFile" ADD CONSTRAINT "ContextFile_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A note outside every folder keeps "folderId" NULL, so existing notes are untouched.
ALTER TABLE "Note" ADD COLUMN "folderId" TEXT;
CREATE INDEX "Note_folderId_idx" ON "Note"("folderId");
ALTER TABLE "Note" ADD CONSTRAINT "Note_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ContextFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
