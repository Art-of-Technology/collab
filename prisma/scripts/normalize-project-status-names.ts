import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Converts a string to snake_case, handling any characters.
 * Handles spaces, hyphens, underscores, special characters, and unicode.
 */
function toSnakeCase(str: string): string {
  if (!str) return '';
  
  return str
    // Convert to lowercase
    .toLowerCase()
    // Replace any sequence of non-alphanumeric characters (including spaces, hyphens, etc.) with a single underscore
    .replace(/[^a-z0-9]+/g, '_')
    // Remove leading and trailing underscores
    .replace(/^_+|_+$/g, '')
    // Ensure we don't have empty strings
    || 'unnamed';
}

async function main() {
  console.log('Starting normalization of ProjectStatus names...');

  // Fetch all project statuses
  const projectStatuses = await prisma.projectStatus.findMany({
    select: {
      id: true,
      name: true,
      displayName: true,
      projectId: true,
    },
  });

  console.log(`Found ${projectStatuses.length} project statuses to process.`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const status of projectStatuses) {
    try {
      // Convert displayName to snake_case
      const normalizedName = toSnakeCase(status.displayName);

      // Skip if the name is already normalized (case-insensitive comparison)
      if (status.name.toLowerCase() === normalizedName.toLowerCase()) {
        console.log(`Skipping ${status.id}: name already normalized (${status.name})`);
        skippedCount++;
        continue;
      }

      // Check if the normalized name would conflict with another status in the same project
      const existingStatus = await prisma.projectStatus.findFirst({
        where: {
          projectId: status.projectId,
          name: normalizedName,
          id: { not: status.id },
        },
      });

      if (existingStatus) {
        console.warn(
          `Skipping ${status.id} (${status.displayName}): normalized name "${normalizedName}" conflicts with existing status "${existingStatus.displayName}" in project ${status.projectId}`
        );
        skippedCount++;
        continue;
      }

      // Update the name
      await prisma.projectStatus.update({
        where: { id: status.id },
        data: { name: normalizedName },
      });

      console.log(
        `Updated ${status.id}: "${status.displayName}" -> name: "${status.name}" -> "${normalizedName}"`
      );
      updatedCount++;
    } catch (error) {
      console.error(`Error processing status ${status.id}:`, error);
      errorCount++;
    }
  }

  console.log('\n=== Normalization Summary ===');
  console.log(`Total processed: ${projectStatuses.length}`);
  console.log(`Updated: ${updatedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

