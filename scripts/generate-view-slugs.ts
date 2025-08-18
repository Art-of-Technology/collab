#!/usr/bin/env tsx

/**
 * Migration script to generate slugs for existing views
 * 
 * This script should be run after adding the slug field to the View model
 * It will generate unique slugs for all existing views based on their names
 */

import { PrismaClient } from '@prisma/client';
import { createSlug, generateRandomSuffix } from '../src/lib/utils';

const prisma = new PrismaClient();

interface ViewSlugData {
  id: string;
  name: string;
  workspaceId: string;
  existingSlug?: string;
}

async function generateSlugForView(
  view: ViewSlugData,
  existingSlugs: Set<string>
): Promise<string> {
  const baseSlug = createSlug(view.name);
  let slug = baseSlug;
  let attempts = 0;
  const maxAttempts = 10;
  
  // Create workspace-specific key for checking uniqueness
  const createKey = (s: string) => `${view.workspaceId}:${s}`;

  // Check if the base slug is available
  while (existingSlugs.has(createKey(slug)) && attempts < maxAttempts) {
    // If slug exists, append a random suffix
    const suffix = generateRandomSuffix(4);
    slug = `${baseSlug}-${suffix}`;
    attempts++;
  }

  // Fallback: if we still have conflicts after maxAttempts, use timestamp
  if (attempts >= maxAttempts) {
    slug = `${baseSlug}-${Date.now().toString().slice(-6)}`;
  }

  // Add to set to prevent future conflicts
  existingSlugs.add(createKey(slug));
  
  return slug;
}

async function main() {
  console.log('🔄 Starting view slug generation...');

  try {
    // Get all views that don't have slugs yet
    const viewsWithoutSlugs = await prisma.view.findMany({
      where: {
        OR: [
          { slug: null },
          { slug: '' }
        ]
      },
      select: {
        id: true,
        name: true,
        workspaceId: true,
        slug: true
      }
    });

    console.log(`📋 Found ${viewsWithoutSlugs.length} views without slugs`);

    if (viewsWithoutSlugs.length === 0) {
      console.log('✅ All views already have slugs!');
      return;
    }

    // Get all existing slugs to prevent conflicts
    const existingViews = await prisma.view.findMany({
      where: {
        slug: {
          not: null
        }
      },
      select: {
        slug: true,
        workspaceId: true
      }
    });

    // Create a set of existing workspace:slug combinations
    const existingSlugs = new Set<string>();
    existingViews.forEach(view => {
      if (view.slug) {
        existingSlugs.add(`${view.workspaceId}:${view.slug}`);
      }
    });

    console.log(`🔍 Found ${existingSlugs.size} existing slugs to avoid conflicts`);

    // Process views in batches
    const batchSize = 10;
    const updates: Array<{ id: string; slug: string }> = [];

    console.log('🏭 Generating slugs...');
    
    for (const view of viewsWithoutSlugs) {
      const slug = await generateSlugForView(view, existingSlugs);
      updates.push({ id: view.id, slug });
      
      if (updates.length >= batchSize) {
        // Process batch
        await Promise.all(
          updates.map(update =>
            prisma.view.update({
              where: { id: update.id },
              data: { slug: update.slug }
            })
          )
        );
        
        console.log(`✅ Updated ${updates.length} views with slugs`);
        updates.length = 0; // Clear the array
      }
    }

    // Process remaining updates
    if (updates.length > 0) {
      await Promise.all(
        updates.map(update =>
          prisma.view.update({
            where: { id: update.id },
            data: { slug: update.slug }
          })
        )
      );
      
      console.log(`✅ Updated final ${updates.length} views with slugs`);
    }

    console.log('🎉 View slug generation completed successfully!');

    // Verify the results
    const viewsStillWithoutSlugs = await prisma.view.count({
      where: {
        OR: [
          { slug: null },
          { slug: '' }
        ]
      }
    });

    if (viewsStillWithoutSlugs > 0) {
      console.warn(`⚠️  Warning: ${viewsStillWithoutSlugs} views still don't have slugs`);
    } else {
      console.log('✅ All views now have slugs!');
    }

  } catch (error) {
    console.error('❌ Error generating view slugs:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  main()
    .then(() => {
      console.log('🏁 Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

export { main };