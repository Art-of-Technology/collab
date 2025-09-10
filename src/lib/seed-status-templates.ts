import { prisma } from "@/lib/prisma";
import { DEFAULT_PROJECT_STATUSES } from "@/constants/project-statuses";

/**
 * Seeds the database with default status templates if they don't exist
 * This is called during onboarding to ensure status templates are available
 */
export async function seedDefaultStatusTemplates() {
  try {
    // Check if status templates already exist
    const existingTemplates = await prisma.statusTemplate.findMany({
      where: { isDefault: true }
    });

    if (existingTemplates.length > 0) {
      console.log(`✅ Status templates already exist (${existingTemplates.length} found)`);
      return existingTemplates;
    }

    console.log('🌱 Seeding default status templates...');

    // Create default status templates based on our constants
    const templates = await prisma.statusTemplate.createMany({
      data: DEFAULT_PROJECT_STATUSES.map(status => ({
        name: status.name,
        displayName: status.displayName,
        color: status.color,
        order: status.order,
        category: 'status',
        isDefault: true,
        isActive: true,
        iconName: getIconForStatus(status.name)
      })),
      skipDuplicates: true
    });

    console.log(`✅ Created ${templates.count} default status templates`);

    // Return the created templates
    return await prisma.statusTemplate.findMany({
      where: { isDefault: true },
      orderBy: { order: 'asc' }
    });

  } catch (error) {
    console.error('❌ Failed to seed status templates:', error);
    throw error;
  }
}

/**
 * Get appropriate icon for each status
 */
function getIconForStatus(statusName: string): string {
  const iconMap: Record<string, string> = {
    'backlog': 'archive',
    'todo': 'circle',
    'in_progress': 'timer',
    'in_review': 'eye',
    'done': 'check-circle-2',
    'canceled': 'x-circle'
  };

  return iconMap[statusName] || 'circle';
}

/**
 * Ensures that default status templates exist in the database
 * Safe to call multiple times - will not create duplicates
 */
export async function ensureDefaultStatusTemplates() {
  const templates = await prisma.statusTemplate.findMany({
    where: { isDefault: true }
  });

  if (templates.length === 0) {
    await seedDefaultStatusTemplates();
  }

  return templates;
}
