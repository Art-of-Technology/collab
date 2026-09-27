# Fix Duplicate Issue Prefixes Script

## Problem
This script fixes duplicate issue prefixes within workspaces that cause conflicts where issues become unreachable (e.g., multiple projects with "DNN" prefix creating DNN-T1 conflicts).

## Solution
The script automatically:
1. Scans all projects for duplicate issue prefixes within each workspace
2. Keeps the oldest project with the original prefix
3. Renames duplicates with incremental numbers (e.g., DNN → DNN1, DNN2)
4. Ensures all prefixes become unique within their workspace

## Usage

### Step 1: Run the cleanup script
```bash
npx tsx scripts/fix-duplicate-issue-prefixes.ts
```

### Step 2: Apply database constraints
Use the reviewed migration process described in the
[database guide](../docs/database-bootstrap.md), then regenerate the Prisma client
with `npx prisma generate`.

## Example Output
```
🔍 Checking for duplicate issue prefixes...

📊 Found 4 total projects

🏢 Processing workspace: workspace-123
   ⚠️  Found 1 duplicate prefix(es)

   📝 Fixing prefix "DNN" (2 projects):
      ✅ Keeping "Project A" with prefix "DNN"
      🔄 Updated "Project B" from "DNN" to "DNN1"

📈 Summary:
   • Total duplicate projects found: 1
   • Projects successfully updated: 1

✅ All duplicate issue prefixes have been fixed!
```

## Safety Features
- **Non-destructive**: Only updates project prefixes, never deletes data
- **Preserves history**: Oldest projects keep their original prefixes
- **Intelligent naming**: Uses smart algorithms to generate meaningful prefixes
- **Conflict prevention**: Checks for conflicts before applying new prefixes

## After Running
All your existing issues will be accessible again with their unique prefixes, and the database will enforce uniqueness going forward.
