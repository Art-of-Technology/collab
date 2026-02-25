import { NextRequest, NextResponse } from 'next/server';
import { cloudinary } from '@/utils/cloudinary-server';

// Whitelist of allowed video MIME types
const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
];

// Maximum video file size (50MB in bytes)
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

/**
 * API route handler for uploading videos to Cloudinary
 * @param req Request object containing the video file
 * @returns Response with the uploaded video URL or an error
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('video') as File | null;
    
    if (!file) {
      return NextResponse.json(
        { error: 'Video file is required' },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid video format. Allowed formats: ${ALLOWED_VIDEO_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        { error: `Video file too large. Maximum size: ${MAX_VIDEO_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }
    
    // Convert file to buffer for Cloudinary upload
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Upload to Cloudinary using a promise wrapper for the upload_stream method
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'devitter/videos',
          resource_type: 'video',
          chunk_size: 6000000, // 6MB chunks for large videos
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      uploadStream.end(buffer);
    });
    
    // Return the video URL and other information
    return NextResponse.json({ 
      url: (result as any).secure_url,
      public_id: (result as any).public_id,
      duration: (result as any).duration,
      format: (result as any).format
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

