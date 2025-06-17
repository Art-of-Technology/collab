-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('SYSTEM_ADMIN', 'DEVELOPER', 'PROJECT_MANAGER', 'HR', 'LEGAL', 'FINANCE', 'MARKETING', 'SALES', 'CUSTOMER_SUPPORT', 'QA_TESTER', 'DESIGNER', 'CONTENT_CREATOR', 'ANALYST', 'CONSULTANT', 'INTERN', 'GUEST');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'DEVELOPER', 'PROJECT_MANAGER', 'DESIGNER', 'QA_TESTER', 'CONTENT_CREATOR', 'ANALYST', 'MARKETING', 'SALES', 'CUSTOMER_SUPPORT', 'MEMBER', 'VIEWER', 'GUEST');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "Permission" AS ENUM ('CREATE_POST', 'EDIT_SELF_POST', 'EDIT_ANY_POST', 'DELETE_SELF_POST', 'DELETE_ANY_POST', 'COMMENT_ON_POST', 'EDIT_SELF_COMMENT', 'EDIT_ANY_COMMENT', 'DELETE_SELF_COMMENT', 'DELETE_ANY_COMMENT', 'REACT_TO_POST', 'REACT_TO_COMMENT', 'MENTION_USERS', 'VIEW_POSTS', 'BOOKMARK_POST', 'CREATE_TASK', 'EDIT_SELF_TASK', 'EDIT_ANY_TASK', 'DELETE_SELF_TASK', 'DELETE_ANY_TASK', 'ASSIGN_TASK', 'CHANGE_TASK_STATUS', 'COMMENT_ON_TASK', 'VIEW_TASKS', 'CREATE_BOARD', 'EDIT_BOARD', 'DELETE_BOARD', 'MANAGE_BOARD_SETTINGS', 'VIEW_BOARDS', 'CREATE_MILESTONE', 'EDIT_SELF_MILESTONE', 'EDIT_ANY_MILESTONE', 'DELETE_SELF_MILESTONE', 'DELETE_ANY_MILESTONE', 'VIEW_MILESTONES', 'CREATE_EPIC', 'EDIT_SELF_EPIC', 'EDIT_ANY_EPIC', 'DELETE_SELF_EPIC', 'DELETE_ANY_EPIC', 'VIEW_EPICS', 'CREATE_STORY', 'EDIT_SELF_STORY', 'EDIT_ANY_STORY', 'DELETE_SELF_STORY', 'DELETE_ANY_STORY', 'VIEW_STORIES', 'CREATE_FEATURE_REQUEST', 'EDIT_SELF_FEATURE_REQUEST', 'EDIT_ANY_FEATURE_REQUEST', 'DELETE_SELF_FEATURE_REQUEST', 'DELETE_ANY_FEATURE_REQUEST', 'VOTE_ON_FEATURE', 'COMMENT_ON_FEATURE', 'VIEW_FEATURES', 'SEND_MESSAGE', 'VIEW_MESSAGES', 'DELETE_SELF_MESSAGE', 'DELETE_ANY_MESSAGE', 'CREATE_NOTE', 'EDIT_SELF_NOTE', 'EDIT_ANY_NOTE', 'DELETE_SELF_NOTE', 'DELETE_ANY_NOTE', 'VIEW_NOTES', 'MANAGE_WORKSPACE_SETTINGS', 'MANAGE_WORKSPACE_MEMBERS', 'MANAGE_WORKSPACE_PERMISSIONS', 'VIEW_WORKSPACE_ANALYTICS', 'INVITE_MEMBERS', 'REMOVE_MEMBERS', 'CHANGE_MEMBER_ROLES', 'VIEW_MEMBER_LIST', 'MANAGE_INTEGRATIONS', 'EXPORT_DATA', 'IMPORT_DATA', 'VIEW_AUDIT_LOGS', 'MANAGE_NOTIFICATIONS', 'VIEW_REPORTS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
DO $$ BEGIN
    CREATE TABLE "RolePermission" (
        "id" TEXT NOT NULL,
        "workspaceId" TEXT NOT NULL,
        "role" "WorkspaceRole" NOT NULL,
        "permission" "Permission" NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateIndex
DO $$ BEGIN
    CREATE UNIQUE INDEX "RolePermission_workspaceId_role_permission_key" ON "RolePermission"("workspaceId", "role", "permission");
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 1: Add new columns with temporary names
DO $$ BEGIN
    ALTER TABLE "User" ADD COLUMN "newRole" "UserRole" NOT NULL DEFAULT 'DEVELOPER';
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "WorkspaceMember" ADD COLUMN "newRole" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER';
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Step 2: Migrate existing data safely
-- Convert User roles from lowercase strings to uppercase enums
UPDATE "User" SET "newRole" = 
  CASE 
    WHEN "role" = 'admin' THEN 'SYSTEM_ADMIN'::"UserRole"
    WHEN "role" = 'developer' THEN 'DEVELOPER'::"UserRole"
    WHEN "role" = 'project_manager' THEN 'PROJECT_MANAGER'::"UserRole"
    WHEN "role" = 'hr' THEN 'HR'::"UserRole"
    WHEN "role" = 'legal' THEN 'LEGAL'::"UserRole"
    WHEN "role" = 'finance' THEN 'FINANCE'::"UserRole"
    WHEN "role" = 'marketing' THEN 'MARKETING'::"UserRole"
    WHEN "role" = 'sales' THEN 'SALES'::"UserRole"
    WHEN "role" = 'customer_support' THEN 'CUSTOMER_SUPPORT'::"UserRole"
    WHEN "role" = 'qa_tester' THEN 'QA_TESTER'::"UserRole"
    WHEN "role" = 'designer' THEN 'DESIGNER'::"UserRole"
    WHEN "role" = 'content_creator' THEN 'CONTENT_CREATOR'::"UserRole"
    WHEN "role" = 'analyst' THEN 'ANALYST'::"UserRole"
    WHEN "role" = 'consultant' THEN 'CONSULTANT'::"UserRole"
    WHEN "role" = 'intern' THEN 'INTERN'::"UserRole"
    WHEN "role" = 'guest' THEN 'GUEST'::"UserRole"
    ELSE 'DEVELOPER'::"UserRole"  -- Default fallback
  END;

-- Convert WorkspaceMember roles from lowercase strings to uppercase enums
UPDATE "WorkspaceMember" SET "newRole" = 
  CASE 
    WHEN "role" = 'owner' THEN 'OWNER'::"WorkspaceRole"
    WHEN "role" = 'admin' THEN 'ADMIN'::"WorkspaceRole"
    WHEN "role" = 'moderator' THEN 'MODERATOR'::"WorkspaceRole"
    WHEN "role" = 'developer' THEN 'DEVELOPER'::"WorkspaceRole"
    WHEN "role" = 'project_manager' THEN 'PROJECT_MANAGER'::"WorkspaceRole"
    WHEN "role" = 'designer' THEN 'DESIGNER'::"WorkspaceRole"
    WHEN "role" = 'qa_tester' THEN 'QA_TESTER'::"WorkspaceRole"
    WHEN "role" = 'content_creator' THEN 'CONTENT_CREATOR'::"WorkspaceRole"
    WHEN "role" = 'analyst' THEN 'ANALYST'::"WorkspaceRole"
    WHEN "role" = 'marketing' THEN 'MARKETING'::"WorkspaceRole"
    WHEN "role" = 'sales' THEN 'SALES'::"WorkspaceRole"
    WHEN "role" = 'customer_support' THEN 'CUSTOMER_SUPPORT'::"WorkspaceRole"
    WHEN "role" = 'member' THEN 'MEMBER'::"WorkspaceRole"
    WHEN "role" = 'viewer' THEN 'VIEWER'::"WorkspaceRole"
    WHEN "role" = 'guest' THEN 'GUEST'::"WorkspaceRole"
    ELSE 'MEMBER'::"WorkspaceRole"  -- Default fallback
  END;

-- Step 3: Drop old columns and rename new ones
ALTER TABLE "User" DROP COLUMN "role";
ALTER TABLE "User" RENAME COLUMN "newRole" TO "role";

ALTER TABLE "WorkspaceMember" DROP COLUMN "role";
ALTER TABLE "WorkspaceMember" RENAME COLUMN "newRole" TO "role";

-- Add foreign key constraint for RolePermission
DO $$ BEGIN
    ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$; 