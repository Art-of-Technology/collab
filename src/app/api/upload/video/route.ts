import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * API route handler for uploading videos to Cloudinary
 * @param req Request object containing the video data
 * @returns Response with the uploaded video URL or an error
 */
export async function POST(req: NextRequest) {
  try {
    const { video, filename, mimeType } = await req.json();
    
    if (!video) {
      return NextResponse.json(
        { error: 'Video data is required' },
        { status: 400 }
      );
    }
    
    // Upload video to Cloudinary using base64
    // Note: Need to prepend the data URL prefix that was removed in the client
    const dataUrl = `data:${mimeType || 'video/mp4'};base64,${video}`;
    
    const result = await cloudinary.uploader.upload(
      dataUrl,
      {
        folder: 'devitter/videos',
        public_id: filename ? filename.split('.')[0] : undefined,
        resource_type: 'video',
        chunk_size: 6000000, // 6MB chunks for large videos
      }
    );
    
    // Return the video URL and other information
    return NextResponse.json({ 
      url: result.secure_url,
      public_id: result.public_id,
      duration: result.duration,
      format: result.format
    });
  } catch (error) {
    console.error('Error uploading video to Cloudinary:', error);
    
    // Return a meaningful error
    return NextResponse.json(
      { error: 'Failed to upload video' },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb', // Limit file size to 50MB for videos
    },
  },
};

