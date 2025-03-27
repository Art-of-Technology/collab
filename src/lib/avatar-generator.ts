/**
 * Utility to generate a random avatar configuration for new users
 */

interface RandomAvatarOptions {
  // Layer item counts based on available assets
  skinToneCount?: number;
  eyesCount?: number;
  browsCount?: number;
  mouthCount?: number;
  noseCount?: number;
  hairCount?: number;
  eyewearCount?: number;
  accessoryCount?: number;
  
  // Probability of including optional layers
  eyewearProbability?: number;
  accessoryProbability?: number;
}

export interface AvatarConfig {
  avatarSkinTone: number;
  avatarEyes: number;
  avatarBrows: number;
  avatarMouth: number;
  avatarNose: number;
  avatarHair: number;
  avatarEyewear: number;
  avatarAccessory: number;
  useCustomAvatar: boolean;
}

/**
 * Generate a random avatar configuration for a new user
 */
export function generateRandomAvatar(options: RandomAvatarOptions = {}): AvatarConfig {
  const {
    skinToneCount = 6,
    eyesCount = 60,
    browsCount = 60,
    mouthCount = 60,
    noseCount = 60,
    hairCount = 60,
    eyewearCount = 60,
    accessoryCount = 60,
    eyewearProbability = 0.5,
    accessoryProbability = 0.3,
  } = options;
  
  // Helper function to get a random integer from 1 to max
  const getRandomInt = (max: number): number => Math.floor(Math.random() * max) + 1;
  
  return {
    avatarSkinTone: getRandomInt(skinToneCount),
    avatarEyes: getRandomInt(eyesCount),
    avatarBrows: getRandomInt(browsCount),
    avatarMouth: getRandomInt(mouthCount),
    avatarNose: getRandomInt(noseCount),
    avatarHair: getRandomInt(hairCount),
    // For optional parts, have a chance of not including them (value 0)
    avatarEyewear: Math.random() < eyewearProbability ? getRandomInt(eyewearCount) : 0,
    avatarAccessory: Math.random() < accessoryProbability ? getRandomInt(accessoryCount) : 0,
    useCustomAvatar: true,
  };
} 