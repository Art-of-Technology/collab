import { NextRequest, NextResponse } from 'next/server';
import { cloudinary } from '@/utils/cloudinary-server';
import { getCurrentUser } from '@/lib/session';
import { withRateLimit, mediaUploadRateLimit } from '@/lib/rate-limit';

/**
 * API route handler for uploading profile images from URLs to Cloudinary
 * @param req Request object containing the image URL and user info
 * @returns Response with the uploaded image URL or an error
 */
export const POST = withRateLimit(async function(req: NextRequest) {
  try {
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { imageUrl, filename, userId } = await req.json();
    
    const prefix = typeof filename === 'string' ? filename.match(/^profile_[^_]+_/)?.[0] : undefined;
    const ownedPrefix = `${prefix ?? ''}${actor.id}_`;
    if (userId !== actor.id || !prefix || !filename.startsWith(ownedPrefix) || !/^\d+_[a-z0-9]{0,6}$/.test(filename.slice(ownedPrefix.length))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Storage fetches the image itself. It is handed an https address only, never a local path or another scheme.
    if (typeof imageUrl !== 'string' || !URL.canParse(imageUrl) || new URL(imageUrl).protocol !== 'https:') {
      return NextResponse.json(
        { error: 'Invalid image URL format' },
        { status: 400 }
      );
    }

    // Validate that it's a valid image URL
    if (!imageUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) && !imageUrl.includes('googleusercontent.com')) {
      return NextResponse.json(
        { error: 'Invalid image URL format' },
        { status: 400 }
      );
    }
    
    // Upload image to Cloudinary directly from URL
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: 'devitter/profiles',
      public_id: filename,
      resource_type: 'auto',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto', fetch_format: 'auto' }
      ]
    });
    
    // Return the image URL and other information
    return NextResponse.json({ 
      url: result.secure_url,
      public_id: result.public_id,
      width: result.width,
      height: result.height
    });
  } catch (error) {
    console.error('Error uploading profile image to Cloudinary:', error);
    
    // Return a meaningful error
    return NextResponse.json(
      { error: 'Failed to upload profile image' },
      { status: 500 }
    );
  }
}, mediaUploadRateLimit);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
