ALTER TABLE IF EXISTS "task_relations"
 DROP CONSTRAINT IF EXISTS "task_relations_parentId_fkey";
DROP TABLE IF EXISTS "task_relations" CASCADE;