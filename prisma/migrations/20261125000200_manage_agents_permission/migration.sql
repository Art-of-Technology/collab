-- The permission to manage a workspace's agent seats and tokens (CLB-1163). Its rows come in the next migration:
-- a new enum value cannot be used in the transaction that adds it, so this one stands alone.
-- No grant: an enum value needs none, and no table changes. Safe to run again (IF NOT EXISTS).
-- Appended last, where Prisma puts it for a database built from the schema.
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'MANAGE_AGENTS';
