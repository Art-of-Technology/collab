import { NextRequest, NextResponse } from 'next/server';
import { cloudinary } from '@/utils/cloudinary-server';

/**
 * API route handler for uploading images to Cloudinary
 * @param req Request object containing the image data
 * @returns Response with the uploaded image URL or an error
 */
export async function POST(req: NextRequest) {
  try {
    const { image, filename } = await req.json();
    
    if (!image) {
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
        public_id: filename ? filename.split('.')[0] : undefined,
        resource_type: 'auto', // Auto-detect the file type
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