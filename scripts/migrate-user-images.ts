import { PrismaClient } from '@prisma/client';
import { uploadProfileImageFromUrl } from '../src/utils/user-image-handler';

const prisma = new PrismaClient();

/**
 * Migration script to upload all existing user profile images to Cloudinary
 * and replace Google URLs with Cloudinary URLs in the database
 */
async function migrateUserImagesToCloudinary() {
  console.log('🚀 Starting user profile image migration to Cloudinary...');
  
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  
  try {
    // Get all users with Google profile images
    const users = await prisma.user.findMany({
      where: {
        image: {
          not: null,
          contains: 'googleusercontent.com'
        }
      },
      select: {
        id: true,
        image: true,
        name: true,
        email: true
      }
    });
    
    console.log(`📊 Found ${users.length} users with Google profile images`);
    
    if (users.length === 0) {
      console.log('✅ No users found with Google profile images. Migration complete!');
      return;
    }
    
    // Process each user
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`\n📷 Processing user ${i + 1}/${users.length}: ${user.name} (${user.email})`);
      console.log(`   Original image: ${user.image}`);
      
      try {
        // Skip if image is null or already a Cloudinary URL
        if (!user.image) {
          console.log('   ⏭️  Skipped: No image URL');
          skippedCount++;
          continue;
        }
        
        if (user.image.includes('cloudinary.com')) {
          console.log('   ⏭️  Skipped: Already using Cloudinary');
          skippedCount++;
          continue;
        }
        
        // Upload to Cloudinary
        console.log('   📤 Uploading to Cloudinary...');
        const cloudinaryUrl = await uploadProfileImageFromUrl(
          user.image, 
          user.id, 
          'google'
        );
        
        // Update database with new Cloudinary URL
        await prisma.user.update({
          where: { id: user.id },
          data: { image: cloudinaryUrl }
        });
        
        console.log(`   ✅ Success! New image: ${cloudinaryUrl}`);
        successCount++;
        
        // Add a small delay to avoid overwhelming Cloudinary
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`   ❌ Error processing user ${user.id}:`, error);
        errorCount++;
        
        // Continue with next user even if one fails
        continue;
      }
    }
    
    // Summary
    console.log('\n📈 Migration Summary:');
    console.log(`✅ Successfully migrated: ${successCount} users`);
    console.log(`⏭️  Skipped: ${skippedCount} users`);
    console.log(`❌ Errors: ${errorCount} users`);
    console.log(`📊 Total processed: ${users.length} users`);
    
    if (errorCount === 0) {
      console.log('\n🎉 Migration completed successfully!');
    } else {
      console.log('\n⚠️  Migration completed with some errors. Check logs above.');
    }
    
  } catch (error) {
    console.error('💥 Fatal error during migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Export the function for use in other scripts
export { migrateUserImagesToCloudinary };

// If running this file directly
if (require.main === module) {
  migrateUserImagesToCloudinary()
    .then(() => {
      console.log('Migration script finished.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
} 