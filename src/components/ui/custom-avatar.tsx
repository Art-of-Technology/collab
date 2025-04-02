"use client";

import React from 'react';
import Image from 'next/image';

interface FaceLayerProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  zIndex?: number;
}

const FaceLayer = ({ src, alt, className = "", priority = false, zIndex = 1 }: FaceLayerProps) => {
  const [hasError, setHasError] = React.useState(false);
  
  // If there was an error loading the image, don't render anything
  if (hasError) {
    return null;
  }
  
  return (
    <div className={`absolute inset-0 ${className}`} style={{ zIndex }}>
      <Image 
        src={src} 
        alt={alt} 
        width={200} 
        height={200} 
        className="w-full h-full object-contain" 
        priority={priority}
        onError={(e) => {
          console.error(`Failed to load image: ${src}`, e);
          setHasError(true);
        }}
        loading={priority ? "eager" : "lazy"}
        unoptimized={true} 
      />
    </div>
  );
};

export interface CustomAvatarProps {
  size?: "sm" | "md" | "lg" | "xl";
  user: {
    avatarSkinTone?: number | null;
    avatarEyes?: number | null;
    avatarBrows?: number | null;
    avatarMouth?: number | null;
    avatarNose?: number | null;
    avatarHair?: number | null;
    avatarEyewear?: number | null;
    avatarAccessory?: number | null;
    useCustomAvatar?: boolean;
    image?: string | null;
    name?: string | null;
  };
  className?: string;
}

export function CustomAvatar({ size = "md", user, className = "" }: CustomAvatarProps) {
  // Default values if specific parts are not set
  const skinTone = user.avatarSkinTone || 1;
  const eyes = user.avatarEyes || 1;
  const brows = user.avatarBrows || 1;
  const mouth = user.avatarMouth || 1;
  const nose = user.avatarNose || 1;
  const hair = user.avatarHair || 1;
  const eyewear = user.avatarEyewear || 0;
  const accessory = user.avatarAccessory || 0;
  

  // Helper function to build the correct image path
  const getImagePath = (part: string, index: number) => {
    // Ensure index is within valid range
    if (index <= 0) return null;
    
    // Return the correct path
    return `/face-layers/${part}/${index}.png`;
  };
  
  // Size classes
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-16 w-16",
    xl: "h-24 w-24",
  };
  
  // If custom avatar is not enabled, render the default avatar
  if (!user.useCustomAvatar) {
    return (
      <div className={`relative rounded-full overflow-hidden ${sizeClasses[size]} ${className}`}>
        {user.image ? (
          <Image 
            src={user.image} 
            alt={user.name || "User"} 
            fill 
            className="object-cover" 
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-medium">
            {user.name?.charAt(0).toUpperCase() || "U"}
          </div>
        )}
      </div>
    );
  }
  
  // Prepare layer sources to ensure they're valid
  const skinPath = getImagePath('skintone', skinTone);
  const eyesPath = getImagePath('eyes', eyes);
  const browsPath = getImagePath('brows', brows);
  const nosePath = getImagePath('nose', nose);
  const mouthPath = getImagePath('mouth', mouth);
  const hairPath = getImagePath('hair', hair);
  const eyewearPath = eyewear > 0 ? getImagePath('eyewear', eyewear) : null;
  const accessoryPath = accessory > 0 ? getImagePath('accessory', accessory) : null;
  
  // Render custom avatar with all selected face parts
  return (
    <div className={`relative rounded-full overflow-hidden ${sizeClasses[size]} ${className} bg-white`}>
      {/* Base layer - Skin - load with priority to ensure it appears first */}
      {skinPath && (
        <FaceLayer 
          key={`skin-${skinTone}`}
          src={skinPath} 
          alt={`Skin Tone ${skinTone}`} 
          priority={true}
          zIndex={1}
        />
      )}
      
      {/* Eyes */}
      {eyesPath && (
        <FaceLayer 
          key={`eyes-${eyes}`}
          src={eyesPath} 
          alt="Eyes" 
          zIndex={3}
        />
      )}
      
      {/* Brows */}
      {browsPath && (
        <FaceLayer 
          key={`brows-${brows}`}
          src={browsPath} 
          alt="Eyebrows" 
          zIndex={4}
        />
      )}
      
      {/* Nose */}
      {nosePath && (
        <FaceLayer 
          key={`nose-${nose}`}
          src={nosePath} 
          alt="Nose" 
          zIndex={2}
        />
      )}
      
      {/* Mouth */}
      {mouthPath && (
        <FaceLayer 
          key={`mouth-${mouth}`}
          src={mouthPath} 
          alt="Mouth" 
          zIndex={2}
        />
      )}
      
      {/* Hair */}
      {hairPath && (
        <FaceLayer 
          key={`hair-${hair}`}
          src={hairPath} 
          alt="Hair" 
          zIndex={5}
        />
      )}
      
      {/* Eyewear (optional) */}
      {eyewearPath && (
        <FaceLayer 
          key={`eyewear-${eyewear}`}
          src={eyewearPath} 
          alt="Eyewear" 
          zIndex={6}
        />
      )}
      
      {/* Accessory (optional) */}
      {accessoryPath && (
        <FaceLayer 
          key={`accessory-${accessory}`}
          src={accessoryPath} 
          alt="Accessory" 
          zIndex={7}
        />
      )}
    </div>
  );
} 