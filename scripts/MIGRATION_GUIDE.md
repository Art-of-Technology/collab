# Production Database Migration Guide

## Overview

This guide covers the migration from the old schema (TaskBoard/Task/Epic/Story/Milestone) to the new unified schema (Project/Issue/View).

## Pre-Migration Checklist

1. **Backup your production database**
   ```bash
   pg_dump -h your-host -U your-user -d your-database > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Restore backup to a separate database** (recommended)
   ```bash
   createdb backup_db
   psql -h your-host -U your-user -d backup_db < backup.sql
   ```

3. **Verify environment variables**
   - `DATABASE_URL` - Your target production database
   - `BACKUP_DATABASE_URL` - Your backup database URL (optional)
   - `CLEAR_TARGET_DB` - Set to "true" if you want to clear target DB first

## Migration Features

The migration script (`data-migration-last.ts`) handles:

### 1. **Status System Migration**
- Creates default status templates (To Do, In Progress, Done, etc.)
- Converts `TaskColumn` → `ProjectStatus` for each project
- Maps old column-based statuses to new status system
- Preserves column order, colors, and metadata

### 2. **Entity Migration**
- `TaskBoard` → `Project` with enhanced fields
- `Task/Epic/Story/Milestone` → unified `Issue` model
- Preserves all relationships and hierarchies
- Maintains issue assignments and reporters

### 3. **Data Integrity**
- Migrates all comments (task comments and board item comments)
- Preserves labels and label associations
- Maintains parent-child relationships
- Transfers attachments and related data
- Generates new issue keys with type prefixes (PROJ-T1, PROJ-E1, etc.)

### 4. **View System**
- Creates default Kanban view for each project
- Sets up proper view permissions and visibility
- Configures default grouping by status

## Running the Migration

### Option 1: Migrate from Current Database
```bash
# This reads and writes to the same database (risky for production)
npm run migrate:production
```

### Option 2: Migrate from Backup Database (Recommended)
```bash
# Set backup database URL
export BACKUP_DATABASE_URL="postgresql://user:password@host:port/backup_db"
export DATABASE_URL="postgresql://user:password@host:port/production_db"

# Optional: Clear target database first (be very careful!)
export CLEAR_TARGET_DB="true"

# Run migration
npm run migrate:production
```

### Option 3: Test Migration First
```bash
# Test on a staging database
export BACKUP_DATABASE_URL="postgresql://user:password@host:port/backup_db"
export DATABASE_URL="postgresql://user:password@host:port/staging_db"
export CLEAR_TARGET_DB="true"

npm run migrate:production
```

## Migration Process

The script executes these steps in order:

1. **Optional: Clear Target Database** (if CLEAR_TARGET_DB=true)
2. **Create Status Templates** - Default status configurations
3. **Migrate Users** - Including accounts and notification preferences
4. **Migrate Workspaces** - Including members and invitations
5. **Migrate Projects** - Convert TaskBoards to Projects
6. **Migrate Project Statuses** - Convert TaskColumns to ProjectStatuses
7. **Migrate Labels** - Preserve all label data
8. **Migrate Issues** - Convert all task types to unified Issue model
9. **Update Relationships** - Set parent-child relationships
10. **Migrate Comments** - Transfer all comments to new system
11. **Migrate Related Data** - Assignees, followers, etc.
12. **Generate Issue Keys** - Create type-prefixed keys
13. **Create Default Views** - Set up Kanban views for each project
14. **Verify Migration** - Check data integrity

## Post-Migration Tasks

1. **Verify Data Integrity**
   ```sql
   -- Check issue counts
   SELECT type, COUNT(*) FROM "Issue" GROUP BY type;
   
   -- Check status assignments
   SELECT COUNT(*) FROM "Issue" WHERE "statusId" IS NULL;
   
   -- Verify relationships
   SELECT COUNT(*) FROM "Issue" WHERE "parentId" IS NOT NULL;
   ```

2. **Update Application Code**
   - Deploy the new application version
   - Clear any caches
   - Test critical workflows

3. **Monitor for Issues**
   - Check application logs
   - Monitor user reports
   - Have rollback plan ready

## Rollback Plan

If issues occur:

1. **Stop the application**
2. **Restore from backup**
   ```bash
   psql -h your-host -U your-user -d your-database < backup.sql
   ```
3. **Deploy previous application version**

## Common Issues and Solutions

### Issue: Status mapping failures
**Solution**: The script maps columns to statuses intelligently, but you may need to manually update some statuses post-migration.

### Issue: Duplicate key violations
**Solution**: This usually happens if migration is run multiple times. Use CLEAR_TARGET_DB=true for clean migration.

### Issue: Missing relationships
**Solution**: The script preserves all relationships, but complex custom relationships may need manual verification.

## Migration Statistics

The script provides detailed statistics:
- Users migrated
- Workspaces migrated
- Projects created
- Statuses created
- Issues created
- Comments migrated
- Views created
- Relationships updated

## Support

For issues during migration:
1. Check the console output for specific errors
2. Verify your database connections
3. Ensure all required tables exist in the target database
4. Check that Prisma schema is up to date

## Important Notes

- **Always test on a staging environment first**
- **Never run on production without a backup**
- **The migration is designed to be idempotent** - it can be run multiple times safely (with CLEAR_TARGET_DB=false)
- **Large databases** may take significant time - plan accordingly
- **Monitor disk space** during migration
