import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate a URL-friendly slug from a string
 */
export function createSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Replace spaces with hyphens
    .replace(/\s+/g, '-')
    // Remove special characters except hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Replace multiple consecutive hyphens with single hyphen
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Ensure it's not empty
    || 'view'
}

/**
 * Generate an uppercase workspace slug from a name or custom slug input.
 * - Uses initials for multi-word names
 * - Uses first letters for single-word names (minimum 3 characters)
 */
export function generateWorkspaceSlug(input: string): string {
  const trimmed = input.trim()

  if (!trimmed) {
    return ''
  }

  const words = trimmed
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)

  if (!words.length) {
    return ''
  }

  const upperWords = words.map((word) => word.toUpperCase())
  let slug = ''

  if (upperWords.length > 1) {
    slug = upperWords.map((word) => word[0]).join('')

    if (slug.length < 3) {
      let index = 1
      while (slug.length < 3) {
        let added = false

        for (const word of upperWords) {
          if (word.length > index) {
            slug += word[index]
            added = true

            if (slug.length >= 3) {
              break
            }
          }
        }

        if (!added) {
          break
        }

        index++
      }
    }
  } else {
    const singleWord = upperWords[0]
    slug = singleWord.slice(0, 3)
  }

  const fallbackSource = upperWords[0]
  const fallbackChar = fallbackSource ? fallbackSource[fallbackSource.length - 1] : 'X'

  while (slug.length < 3) {
    slug += fallbackChar ?? 'X'
  }

  if (slug.length > 30) {
    slug = slug.slice(0, 30)
  }

  return slug
}

/**
 * Generate a random string for making slugs unique
 */
export function generateRandomSuffix(length: number = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Generate a unique slug for a view within a workspace
 */
export async function generateUniqueViewSlug(
  name: string,
  workspaceId: string,
  existingSlugChecker: (slug: string, workspaceId: string) => Promise<boolean>
): Promise<string> {
  const baseSlug = createSlug(name)
  let slug = baseSlug
  let attempts = 0
  const maxAttempts = 10

  // Check if the base slug is available
  while (await existingSlugChecker(slug, workspaceId) && attempts < maxAttempts) {
    // If slug exists, append a random suffix
    const suffix = generateRandomSuffix(4)
    slug = `${baseSlug}-${suffix}`
    attempts++
  }

  // Fallback: if we still have conflicts after maxAttempts, use timestamp
  if (attempts >= maxAttempts) {
    slug = `${baseSlug}-${Date.now().toString().slice(-6)}`
  }

  return slug
}
