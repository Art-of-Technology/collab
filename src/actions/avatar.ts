'use server';

import fs from 'fs';
import path from 'path';

/**
 * Gets the counts of available face layer images
 */
export async function getFaceLayerCounts() {
  try {
    const basePath = path.join(process.cwd(), 'public', 'face-layers');
    
    // Get counts of each layer type
    const layerCounts = {
      skintone: countFiles(path.join(basePath, 'skintone')),
      eyes: countFiles(path.join(basePath, 'eyes')),
      brows: countFiles(path.join(basePath, 'brows')),
      mouth: countFiles(path.join(basePath, 'mouth')),
      nose: countFiles(path.join(basePath, 'nose')),
      hair: countFiles(path.join(basePath, 'hair')),
      eyewear: countFiles(path.join(basePath, 'eyewear')),
      accessory: countFiles(path.join(basePath, 'accessory')),
    };
    
    return { layerCounts };
  } catch (error) {
    console.error("[FACE_LAYER_COUNTS_ERROR]", error);
    throw new Error("Failed to get face layer counts");
  }
}

// Helper function to count files in a directory
function countFiles(directoryPath: string): number {
  try {
    const files = fs.readdirSync(directoryPath);
    // Filter to only include png files
    const pngFiles = files.filter(file => 
      file.toLowerCase().endsWith('.png') && 
      /^\d+\.png$/.test(file)
    );
    
    // Find the highest number
    const highestNumber = pngFiles.reduce((max, file) => {
      const num = parseInt(file.split('.')[0], 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    
    return highestNumber;
  } catch (error) {
    console.error(`Error counting files in ${directoryPath}:`, error);
    return 0;
  }
} 