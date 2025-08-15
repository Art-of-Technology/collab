-- Remove foreign key constraint from TaskRelations table
ALTER TABLE "task_relations" DROP CONSTRAINT IF EXISTS "task_relations_taskId_fkey"; 