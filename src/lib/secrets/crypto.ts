/**
 * Secrets Vault Encryption Library
 *
 * Uses AES-256-GCM (authenticated encryption) with:
 * - PBKDF2 key derivation from master key + workspace context
 * - Random 12-byte IV per encryption
 * - Authentication tag for integrity verification
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const PBKDF2_ITERATIONS = 100000;

export interface EncryptedData {
  iv: string;        // Base64 encoded
  content: string;   // Base64 encoded
  tag: string;       // Base64 encoded (auth tag)
  version: number;   // Encryption version for future key rotation
}

export interface SecretVariable {
  key: string;
  encryptedValue: string;  // JSON stringified EncryptedData
  masked: boolean;         // Whether to mask in UI by default
  description?: string;
}

export interface DecryptedVariable {
  key: string;
  value: string;
  masked: boolean;
  description?: string;
}

/**
 * Get the master key from environment
 * @throws Error if SECRETS_MASTER_KEY is not configured
 */
function getMasterKey(): string {
  const masterKey = process.env.SECRETS_MASTER_KEY;
  if (!masterKey) {
    throw new Error('SECRETS_MASTER_KEY environment variable is not configured. Generate one with: openssl rand -hex 32');
  }
  if (masterKey.length < 32) {
    throw new Error('SECRETS_MASTER_KEY must be at least 32 characters. Generate one with: openssl rand -hex 32');
  }
  return masterKey;
}

/**
 * Derive an encryption key from the master key + workspace context
 * This ensures each workspace has unique encryption keys
 */
export function deriveKey(workspaceId: string): Buffer {
  const masterKey = getMasterKey();

  // Create a workspace-specific salt from the workspace ID
  const salt = crypto.createHash('sha256')
    .update(`collab-secrets-v1-${workspaceId}`)
    .digest()
    .slice(0, SALT_LENGTH);

  return crypto.pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * Encrypt plaintext using AES-256-GCM
 * @param plaintext - The text to encrypt
 * @param workspaceId - Workspace ID for key derivation
 * @returns Encrypted data object with iv, content, tag, and version
 */
export function encrypt(plaintext: string, workspaceId: string): EncryptedData {
  const key = deriveKey(workspaceId);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  return {
    iv: iv.toString('base64'),
    content: encrypted,
    tag: cipher.getAuthTag().toString('base64'),
    version: 1
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * @param data - Encrypted data object
 * @param workspaceId - Workspace ID for key derivation
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (wrong key, tampered data, etc.)
 */
export function decrypt(data: EncryptedData, workspaceId: string): string {
  const key = deriveKey(workspaceId);
  const iv = Buffer.from(data.iv, 'base64');
  const tag = Buffer.from(data.tag, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data.content, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt a single secret variable value
 * @param value - The secret value to encrypt
 * @param workspaceId - Workspace ID for key derivation
 * @returns JSON string of EncryptedData
 */
export function encryptVariable(value: string, workspaceId: string): string {
  const encrypted = encrypt(value, workspaceId);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt a single secret variable value
 * @param encryptedValue - JSON string of EncryptedData
 * @param workspaceId - Workspace ID for key derivation
 * @returns Decrypted value
 */
export function decryptVariable(encryptedValue: string, workspaceId: string): string {
  const data = JSON.parse(encryptedValue) as EncryptedData;
  return decrypt(data, workspaceId);
}

/**
 * Encrypt an array of secret variables
 * Only encrypts the values, keys remain in plaintext for search/display
 * @param variables - Array of variables with plaintext values
 * @param workspaceId - Workspace ID for key derivation
 * @returns Array of variables with encrypted values
 */
export function encryptVariables(
  variables: { key: string; value: string; masked?: boolean; description?: string }[],
  workspaceId: string
): SecretVariable[] {
  return variables.map(v => ({
    key: v.key,
    encryptedValue: encryptVariable(v.value, workspaceId),
    masked: v.masked ?? true,
    description: v.description
  }));
}

/**
 * Decrypt an array of secret variables
 * @param variables - Array of variables with encrypted values
 * @param workspaceId - Workspace ID for key derivation
 * @returns Array of variables with decrypted values
 */
export function decryptVariables(
  variables: SecretVariable[],
  workspaceId: string
): DecryptedVariable[] {
  return variables.map(v => ({
    key: v.key,
    value: decryptVariable(v.encryptedValue, workspaceId),
    masked: v.masked,
    description: v.description
  }));
}

/**
 * Encrypt raw .env content
 * @param content - Raw .env file content
 * @param workspaceId - Workspace ID for key derivation
 * @returns JSON string of EncryptedData
 */
export function encryptRawContent(content: string, workspaceId: string): string {
  const encrypted = encrypt(content, workspaceId);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt raw .env content
 * @param encryptedContent - JSON string of EncryptedData
 * @param workspaceId - Workspace ID for key derivation
 * @returns Decrypted raw content
 */
export function decryptRawContent(encryptedContent: string, workspaceId: string): string {
  const data = JSON.parse(encryptedContent) as EncryptedData;
  return decrypt(data, workspaceId);
}

/**
 * Parse .env content into key-value pairs
 * Handles comments, empty lines, and quoted values with escaped characters
 * @param content - Raw .env file content
 * @returns Array of key-value pairs
 */
export function parseEnvContent(content: string): { key: string; value: string }[] {
  const lines = content.split('\n');
  const variables: { key: string; value: string }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Find the first = sign
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, equalIndex).trim();
    let value = trimmed.substring(equalIndex + 1).trim();

    // Remove surrounding quotes if present and unescape content
    if (value.startsWith('"') && value.endsWith('"')) {
      // Double-quoted: unescape \" and \\
      value = value.slice(1, -1)
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    } else if (value.startsWith("'") && value.endsWith("'")) {
      // Single-quoted: take as-is (no escape processing in single quotes)
      value = value.slice(1, -1);
    }

    if (key) {
      variables.push({ key, value });
    }
  }

  return variables;
}

/**
 * Convert key-value pairs to .env format
 * @param variables - Array of key-value pairs
 * @returns Raw .env content string
 */
export function toEnvContent(variables: { key: string; value: string }[]): string {
  return variables
    .map(v => {
      // Quote values that contain spaces or special characters
      const needsQuotes = /[\s#=]/.test(v.value) || v.value.includes('\n') || v.value.includes('\\') || v.value.includes('"');
      // Escape backslashes first, then double quotes (order matters)
      const escapedValue = needsQuotes
        ? `"${v.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
        : v.value;
      return `${v.key}=${escapedValue}`;
    })
    .join('\n');
}

/**
 * Check if a note type is a secret type that should be encrypted
 * @param noteType - The note type to check
 * @returns true if the note type should be encrypted
 */
export function isSecretNoteType(noteType: string): boolean {
  const secretTypes = ['ENV_VARS', 'API_KEYS', 'CREDENTIALS'];
  return secretTypes.includes(noteType);
}

/**
 * Mask a secret value for display
 * @param value - The value to mask
 * @param showLength - Number of characters to show at start (default 0)
 * @returns Masked value (e.g., "••••••••"). Returns empty string for truly empty values.
 */
export function maskValue(value: string, showLength: number = 0): string {
  // For truly empty values, return empty to avoid suggesting hidden content exists
  if (value === '') return '';

  // For null/undefined, return masked placeholder
  if (!value) return '••••••••';

  if (showLength > 0 && value.length > showLength) {
    return value.substring(0, showLength) + '••••••••';
  }

  return '••••••••';
}

/**
 * Check if the secrets master key is configured
 * @returns true if configured, false otherwise
 */
export function isSecretsEnabled(): boolean {
  return !!process.env.SECRETS_MASTER_KEY && process.env.SECRETS_MASTER_KEY.length >= 32;
}
