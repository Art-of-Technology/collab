# Production Deployment Guide: UAT → Main

## Pre-Deployment Checklist

- [ ] Database backup taken
- [ ] `SECRETS_MASTER_KEY` env var generated and ready
- [ ] Verified UAT is stable and tested
- [ ] Main-only commits merged into UAT (see Step 1)

---

## Step 0: Take Database Backup

```bash
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql
```

Keep this backup until deployment is verified (minimum 48 hours).

---

## Step 1: Merge Main → UAT (Resolve Drift)

There are 7 commits on `main` not in `uat`. Merge them first:

```bash
git checkout uat
git pull origin uat
git merge origin/main
# Resolve any conflicts
git push origin uat
```

Key main-only changes:
- Notification preferences compound unique key fix
- ChatProject widget removal
- OAuth scope OR-logic fix
- Remote HTTPS agent callbacks

---

## Step 2: Run Database Migration Script

**This is the critical step. Run BEFORE deploying new code.**

```bash
psql "$DATABASE_URL" -f scripts/production-deploy.sql
```

The script is fully idempotent — safe to run multiple times. It will:

1. Create 7 new enums (NoteType, NoteScope, etc.)
2. Add 15+ new columns to the `Note` table
3. **Migrate `isPublic` → `scope`** (preserving data: `true` → `WORKSPACE`, `false` → `PERSONAL`)
4. Drop `isPublic` only after migration
5. Create 13 new tables (NoteShare, AIAgent, CoclawInstance, etc.)
6. Add status FK tracking to BoardItemActivity
7. Run verification queries

### Expected Verification Output

After running, you should see:
- `total_notes` = your current note count (not zero!)
- `isPublic_still_exists` = 0
- 13 tables listed in new tables check
- `oldStatusId` and `newStatusId` in BoardItemActivity columns

---

## Step 3: Run Seed Scripts

These use upserts — safe to run multiple times.

```bash
# Seed AI agents (Cleo, Alex, Nova)
npx tsx prisma/scripts/seed-ai-agents.ts

# Seed Coclaw system app + OAuth client
# ⚠️  SAVE THE OUTPUT — it prints OAuth credentials you'll need
npx tsx prisma/scripts/seed-coclaw-app.ts
```

---

## Step 4: Run Backfill Scripts

```bash
# Backfill status change activity with proper FK references
npx tsx scripts/backfill-status-activity-fks.ts
```

The `fix-notes-scope.ts` and `migrate-notes-knowledge-system.ts` scripts are
only needed if you want to bulk-convert note scopes for existing workspaces.
The SQL migration already handles `isPublic` → `scope`. These are optional
post-deploy tools.

---

## Step 5: Set Environment Variables

Add to production environment:

```bash
# Required for secrets vault encryption
SECRETS_MASTER_KEY=<64-char-hex-key>
```

Generate with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 6: Create PR and Deploy Code

```bash
# Create PR: uat → main
gh pr create --base main --head uat --title "Production deploy: AI native + Knowledge System + Coclaw"
```

After merge, CI/CD deploys automatically.

### New Infrastructure (if deploying Coclaw):
- GitHub Secrets needed: `COCLAW_REPO_TOKEN`, `COCLAW_ENV_PROD`
- Coclaw Manager requires `SYS_ADMIN` capability (bubblewrap sandbox)
- Qdrant vector DB container

---

## Step 7: Post-Deploy Verification

### Quick Health Check
```bash
# App loads
curl -s -o /dev/null -w "%{http_code}" https://your-production-url.com

# Check logs for errors
docker service logs collab_collab --tail 100 | grep -i error
```

### Database Verification
```sql
-- Notes preserved with correct scopes
SELECT scope, COUNT(*) FROM "Note" GROUP BY scope;

-- AI tables exist and agent seeded
SELECT slug, name FROM "AIAgent";

-- No orphaned data
SELECT COUNT(*) FROM "Note" WHERE "authorId" NOT IN (SELECT id FROM "User");
```

### Functional Verification
- [ ] App loads at production URL
- [ ] Can navigate to views page — ViewTopBar renders
- [ ] Kanban board loads with lazy loading
- [ ] Notes page works — types/scopes visible
- [ ] AI chat widget opens (bottom bar)
- [ ] Creating a new note works
- [ ] Filter dropdown in views works

---

## Rollback Plan

### Code Only (no DB changes needed)
```bash
git revert <merge-commit-sha>
git push origin main
# CI/CD redeploys previous code
```

### Full Rollback (code + database)
```bash
# 1. Revert code
git revert <merge-commit-sha>
git push origin main

# 2. Restore database from backup
psql "$DATABASE_URL" < backup_YYYYMMDD_HHMMSS.sql
```

### Partial Rollback (keep DB, revert code)
The new DB schema is backward-compatible — new columns have defaults,
new tables are unused by old code. You can revert just the code and the
old version will work fine (it just won't use the new tables).

---

## Risk Summary

| Risk | Impact | Mitigation |
|------|--------|------------|
| Notes data loss during migration | **Critical** | Script migrates `isPublic` → `scope` before dropping column |
| Next.js 15→16 breaking changes | Medium | Tested on UAT |
| Missing env var (`SECRETS_MASTER_KEY`) | Low | Secrets vault won't work but app still runs |
| Coclaw infra not ready | Low | Coclaw features gracefully degrade |

---

## File Reference

| File | Purpose |
|------|---------|
| `scripts/production-deploy.sql` | Main migration script (run this) |
| `prisma/scripts/seed-ai-agents.ts` | Seed AI agent records |
| `prisma/scripts/seed-coclaw-app.ts` | Seed Coclaw app + OAuth |
| `scripts/backfill-status-activity-fks.ts` | Backfill status FKs on activities |
| `scripts/fix-notes-scope.ts` | Optional: bulk convert note scopes |
| `scripts/migrate-notes-knowledge-system.ts` | Optional: full knowledge system migration |
