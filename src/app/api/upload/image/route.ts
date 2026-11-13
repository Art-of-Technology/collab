import { NextRequest, NextResponse } from 'next/server';
import { cloudinary } from '@/utils/cloudinary-server';
import { getCurrentUser } from '@/lib/session';
import { withRateLimit, imageUploadRateLimit } from '@/lib/rate-limit';

// The application buffers at most 10 MB of a request body and cuts off the rest, so a larger upload never arrives whole.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * API route handler for uploading images to Cloudinary
 * @param req Request object containing the image data
 * @returns Response with the uploaded image URL or an error
 */
export const POST = withRateLimit(async function(req: NextRequest) {
  try {
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (Number(req.headers.get('content-length')) > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Image too large. Maximum upload size: 10MB' },
        { status: 413 }
      );
    }

    // A body that is not JSON, or was cut off on the way in, is the caller's error, not the server's.
    const image = (await req.json().catch(() => null))?.image;
    
    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'Image data is required' },
        { status: 400 }
      );
    }
    
    // Upload image to Cloudinary using base64
    // Note: Need to prepend the data URL prefix that was removed in the client
    const result = await cloudinary.uploader.upload(
      `data:image/png;base64,${image}`,
      {
        folder: 'devitter',
        // No public_id: storage names the asset, so an upload never replaces an existing one.
        resource_type: 'image',
      }
    );
    
    // Return the image URL and other information
    return NextResponse.json({ 
      url: result.secure_url,
      public_id: result.public_id
    });
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    
    // Return a meaningful error
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}, imageUploadRateLimit);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Limit file size to 10MB
    },
  },
}; 