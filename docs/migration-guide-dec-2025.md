# Production Migration Guide - December 2024

This guide documents the database migration steps for deploying the unified Issue model and related schema changes.

## Prerequisites

- Database backup completed
- Maintenance window scheduled (estimated 5-10 minutes downtime)
- Access to production database connection string

## Migration Steps

### Step 1: Update FeatureRequest Records (Before Schema Push)

The schema change makes `projectId` required on `FeatureRequest`. Update existing NULL values first:

```bash
psql "$DATABASE_URL" -c "UPDATE \"FeatureRequest\" SET \"projectId\" = 'cm904qa0u0001i903dbgg3mxo' WHERE \"projectId\" IS NULL;"
```

**Expected output:** `UPDATE 68` (or similar count)

> **Note:** Replace `cm904qa0u0001i903dbgg3mxo` with the appropriate default project ID for your production environment.

---

### Step 2: Push Prisma Schema

```bash
npx prisma db push
```

**Expected warnings (safe to accept):**
- Dropping `UserEvent` table
- Dropping `UserStatus` table
- Adding unique constraint on `NotificationPreferences`

When prompted `Do you want to ignore the warning(s)?`, type `yes`.

**Expected output:** `Your database is now in sync with your Prisma schema.`

---

### Step 3: Run BoardItemActivity Migration

This migrates the activity tracking to support the unified Issue model:

```bash
npx tsx scripts/migrate-to-issue-activity.ts
```

**Expected output:**
```
==============================================
  BoardItemActivity → IssueActivity Migration
==============================================

Step 1: Analyzing current state...
  Total BoardItemActivity records: ~37000

Step 2: Checking projectId column...
  ✓ projectId column already exists (or will be added)

Step 3: Records needing projectId: ~37000

Step 4: Populating projectId from Issue table...
  ✓ Updated ~36400 records with projectId from Issue
```

> **Note:** The script may fail at Step 5 if `boardId` column doesn't exist. This is OK - proceed to Step 4.

---

### Step 4: Create Indexes Manually (If Script Failed)

If the migration script failed before creating indexes, run these manually:

```bash
psql "$DATABASE_URL" << 'EOF'
CREATE INDEX IF NOT EXISTS "BoardItemActivity_projectId_idx" ON "BoardItemActivity"("projectId");
CREATE INDEX IF NOT EXISTS "BoardItemActivity_team_sync_idx" ON "BoardItemActivity"("workspaceId", "itemType", "action", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BoardItemActivity_item_history_idx" ON "BoardItemActivity"("itemId", "itemType", "action", "createdAt");
EOF
```

---

### Step 5: Verify Migration

Run these queries to verify the migration:

```bash
# Check FeatureRequest
psql "$DATABASE_URL" -c "SELECT COUNT(*) as total, COUNT(\"projectId\") as with_project FROM \"FeatureRequest\";"

# Check BoardItemActivity
psql "$DATABASE_URL" -c "SELECT COUNT(*) as total, COUNT(\"projectId\") as with_project, COUNT(*) - COUNT(\"projectId\") as orphans FROM \"BoardItemActivity\";"
```

**Expected results:**
- FeatureRequest: All records should have `projectId`
- BoardItemActivity: ~98% should have `projectId`. Orphans are from deleted issues (harmless).

---

## Rollback Plan

If issues occur, the schema changes can be reverted by:

1. Restoring from database backup
2. Or manually reverting schema:
   ```bash
   # Make projectId optional again if needed
   ALTER TABLE "FeatureRequest" ALTER COLUMN "projectId" DROP NOT NULL;
   ```

---

## Post-Migration Checklist

- [ ] Verify application starts without errors
- [ ] Test issue creation/editing
- [ ] Test activity feed displays correctly
- [ ] Test feature requests functionality
- [ ] Monitor error logs for 24 hours

---

## Summary of Changes

| Table | Change |
|-------|--------|
| `FeatureRequest` | `projectId` now required |
| `BoardItemActivity` | Added `projectId` column + indexes |
| `UserEvent` | Dropped (unused) |
| `UserStatus` | Dropped (unused) |
| `NotificationPreferences` | Added unique constraint on `[userId, workspaceId]` |

---

## Timing Estimates

| Step | Duration |
|------|----------|
| Step 1: Update FeatureRequest | < 1 second |
| Step 2: Prisma db push | 15-30 seconds |
| Step 3: BoardItemActivity migration | 1-3 minutes |
| Step 4: Create indexes | 10-30 seconds |
| **Total** | **~5 minutes** |
