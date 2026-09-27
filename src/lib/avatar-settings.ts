import { z } from 'zod';
import { userSelectFields } from '@/lib/user-utils';

const avatarIndex = z.number().int().min(0).max(2147483647).nullable().optional();

export const avatarUpdateSchema = z.object({
  avatarSkinTone: avatarIndex,
  avatarEyes: avatarIndex,
  avatarBrows: avatarIndex,
  avatarMouth: avatarIndex,
  avatarNose: avatarIndex,
  avatarHair: avatarIndex,
  avatarEyewear: avatarIndex,
  avatarAccessory: avatarIndex,
  useCustomAvatar: z.boolean().optional(),
});

export const avatarUserSelect = {
  ...userSelectFields,
  createdAt: true,
  updatedAt: true,
  emailVerified: true,
};
