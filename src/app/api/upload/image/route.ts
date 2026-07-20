import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { getAuthSession } from '@/lib/auth';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * API route handler for uploading images to Cloudinary
 * @param req Request object containing the image data
 * @returns Response with the uploaded image URL or an error
 */
export async function POST(req: NextRequest) {
  try {
    // Require an authenticated session; this is not a public upload endpoint.
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { image, filename } = await req.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'Image data is required' },
        { status: 400 }
      );
    }

    // Cap the decoded payload size server-side (base64 is ~4/3 of raw bytes).
    // ~10MB decoded => ~13.4MB of base64 characters.
    const MAX_BASE64_LENGTH = 14 * 1024 * 1024;
    if (image.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        { error: 'Image is too large' },
        { status: 413 }
      );
    }

    // Upload image to Cloudinary using base64
    // Note: Need to prepend the data URL prefix that was removed in the client
    const result = await cloudinary.uploader.upload(
      `data:image/png;base64,${image}`,
      {
        folder: 'devitter',
        public_id: filename ? filename.split('.')[0] : undefined,
        resource_type: 'image', // Force image; never auto-detect arbitrary types
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
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Limit file size to 10MB
    },
  },
}; 