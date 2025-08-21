import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type Json = Prisma.JsonValue;

function replaceDefectWithBugInFilters(filters: any): { changed: boolean; newFilters: any } {
  if (!filters || typeof filters !== 'object') {
    return { changed: false, newFilters: filters };
  }

  // Only normalize the 'type' filter values
  const cloned = Array.isArray(filters) ? [...filters] : { ...filters };
  let changed = false;

  if (Array.isArray(cloned.type)) {
    const updated = cloned.type.map((v: unknown) => {
      if (typeof v === 'string' && v.toLowerCase() === 'defect') {
        changed = true;
        return 'Bug';
      }
      return v;
    });

    // Only assign if actually changed
    if (changed) {
      cloned.type = updated;
    }
  }

  return { changed, newFilters: cloned };
}

async function normalizeViewFilters() {
  console.log('🔎 Normalizing view filter values: "Defect" -> "Bug"...');

  const views = await prisma.view.findMany({
    select: { id: true, name: true, filters: true },
  });

  let updatedCount = 0;
  for (const view of views) {
    const rawFilters = view.filters as Json | null;
    if (rawFilters === null) continue;
    const filters = rawFilters as any;

    const { changed, newFilters } = replaceDefectWithBugInFilters(filters);
    if (!changed) continue;

    await prisma.view.update({
      where: { id: view.id },
      data: { filters: newFilters as Prisma.InputJsonValue },
    });

    updatedCount++;
    console.log(`✅ Updated view: ${view.name} (${view.id})`);
  }

  if (updatedCount === 0) {
    console.log('✅ No views required normalization.');
  } else {
    console.log(`🎉 Done. Updated ${updatedCount} view(s).`);
  }
}

if (require.main === module) {
  normalizeViewFilters()
    .catch((err) => {
      console.error('❌ Failed to normalize view filters:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { normalizeViewFilters };


