// Simple feature flags for the App Store
// In a production environment, this would be connected to a feature flag service

export const FEATURE_FLAGS = {
  APPS_ENABLED: process.env.NEXT_PUBLIC_FEATURE_APPS === 'true' || process.env.NODE_ENV === 'development',
} as const;

export function isFeatureEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[flag] ?? false;
}

export function useFeatureFlag(flag: keyof typeof FEATURE_FLAGS): boolean {
  return isFeatureEnabled(flag);
}
