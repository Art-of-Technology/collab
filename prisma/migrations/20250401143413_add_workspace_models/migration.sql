/*
  Warnings:

  - A unique constraint covering the columns `[name,workspaceId]` on the table `Tag` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Tag_name_key";

-- AlterTable
ALTER TABLE "FeatureRequest" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "workspaceId" TEXT;

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

-- Create default workspace and migrate existing data
DO $$
DECLARE
    v_owner_id TEXT;
    v_workspace_id TEXT;
BEGIN
    -- Find an admin user to be the owner
    SELECT id INTO v_owner_id FROM "User" WHERE role = 'admin' LIMIT 1;
    
    -- If no admin user, use the first user available
    IF v_owner_id IS NULL THEN
        SELECT id INTO v_owner_id FROM "User" LIMIT 1;
    END IF;
    
    -- If we have a user, create the default workspace
    IF v_owner_id IS NOT NULL THEN
        -- Generate a UUID for the workspace
        v_workspace_id := gen_random_uuid()::TEXT;
        
        -- Create default workspace
        INSERT INTO "Workspace" (id, name, slug, description, "ownerId", "createdAt", "updatedAt")
        VALUES (v_workspace_id, 'Default Workspace', 'default-workspace', 'Default workspace containing all existing data', v_owner_id, NOW(), NOW());
        
        -- Add the owner as a member
        INSERT INTO "WorkspaceMember" (id, "userId", "workspaceId", role, "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::TEXT, v_owner_id, v_workspace_id, 'owner', NOW(), NOW());
        
        -- Add all other users as members
        INSERT INTO "WorkspaceMember" (id, "userId", "workspaceId", role, "createdAt", "updatedAt")
        SELECT gen_random_uuid()::TEXT, id, v_workspace_id, 'member', NOW(), NOW()
        FROM "User"
        WHERE id != v_owner_id;
        
        -- Migrate all existing posts to the default workspace
        UPDATE "Post" SET "workspaceId" = v_workspace_id WHERE "workspaceId" IS NULL;
        
        -- Migrate all existing tags to the default workspace
        UPDATE "Tag" SET "workspaceId" = v_workspace_id WHERE "workspaceId" IS NULL;
        
        -- Migrate all existing feature requests to the default workspace
        UPDATE "FeatureRequest" SET "workspaceId" = v_workspace_id WHERE "workspaceId" IS NULL;
    END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_userId_workspaceId_key" ON "WorkspaceMember"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_token_key" ON "WorkspaceInvitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_email_workspaceId_key" ON "WorkspaceInvitation"("email", "workspaceId");

-- CreateIndex
CREATE INDEX "FeatureRequest_workspaceId_idx" ON "FeatureRequest"("workspaceId");

-- CreateIndex
CREATE INDEX "Post_workspaceId_idx" ON "Post"("workspaceId");

-- CreateIndex
CREATE INDEX "Tag_workspaceId_idx" ON "Tag"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_workspaceId_key" ON "Tag"("name", "workspaceId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
