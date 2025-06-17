-- Add new permissions to the Permission enum
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'PIN_POST';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'RESOLVE_BLOCKER'; 