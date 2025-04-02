/**
 * Standard user select object for Prisma queries
 * Ensures consistent user data format across the application including avatar properties
 */
export const userSelectFields = {
  id: true,
  name: true,
  image: true,
  useCustomAvatar: true,
  avatarSkinTone: true,
  avatarEyes: true,
  avatarBrows: true, 
  avatarMouth: true,
  avatarNose: true,
  avatarHair: true,
  avatarEyewear: true,
  avatarAccessory: true,
}; 