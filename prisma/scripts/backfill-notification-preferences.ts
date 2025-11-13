import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting backfill of NotificationPreferences to be workspace-scoped...');

  // 1) Load all legacy preferences without workspaceId
  const legacyPrefs = await prisma.notificationPreferences.findMany({
    where: { workspaceId: null as any },
  });

  console.log(`Found ${legacyPrefs.length} legacy preference rows without workspaceId.`);

  let createdCount = 0;
  let updatedCount = 0;
  let skippedNoMembership = 0;

  for (const pref of legacyPrefs) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: pref.userId, status: true },
      select: { workspaceId: true },
    });

    if (memberships.length === 0) {
      console.warn(`User ${pref.userId} has no workspace memberships; skipping.`);
      skippedNoMembership += 1;
      continue;
    }

    // Use the legacy row as a template for all of the user's workspaces
    const { id, userId, createdAt, updatedAt, workspaceId, ...template } = pref as any;

    for (const { workspaceId: wsId } of memberships) {
      const existing = await prisma.notificationPreferences.findFirst({
        where: { userId: pref.userId, workspaceId: wsId },
      });

      if (existing) {
        // Optionally update existing with template fields; here we skip to avoid overriding user changes
        // Uncomment if you want to sync missing fields
        // await prisma.notificationPreferences.update({ where: { id: existing.id }, data: template });
        updatedCount += 0; // no-op
        continue;
      }

      await prisma.notificationPreferences.create({
        data: {
          userId: pref.userId,
          workspaceId: wsId,
          ...(template as Record<string, any>),
        },
      });
      createdCount += 1;
    }

    // Remove the legacy row (no workspaceId)
    await prisma.notificationPreferences.delete({ where: { id: pref.id } });
  }

  console.log(`Backfill complete. Created: ${createdCount}, Updated: ${updatedCount}, Skipped (no membership): ${skippedNoMembership}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


