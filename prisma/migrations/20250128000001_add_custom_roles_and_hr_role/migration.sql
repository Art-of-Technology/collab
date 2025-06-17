-- Add HR role to WorkspaceRole enum
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'HR';

-- Create CustomRole table
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#6366F1',
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- Modify WorkspaceMember.role to be text instead of enum
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" TYPE TEXT;
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- Modify RolePermission.role to be text instead of enum  
ALTER TABLE "RolePermission" ALTER COLUMN "role" TYPE TEXT;

-- Create indexes for CustomRole
CREATE INDEX "CustomRole_workspaceId_idx" ON "CustomRole"("workspaceId");

-- Create unique constraint
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_name_workspaceId_key" UNIQUE ("name", "workspaceId");

-- Add foreign key constraints
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; 