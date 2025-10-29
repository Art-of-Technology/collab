import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import bcrypt from 'bcrypt';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

const algorithm = 'aes-256-gcm';
const scryptAsync = promisify(scrypt);

export function generateAuthorizationCode() {
  return randomBytes(32).toString('hex');
}

export async function generateClientCredentials() {
  return {
    clientId: uuidv4(),
    clientSecret: randomBytes(32).toString('hex'),
    apiKey: randomBytes(24).toString('hex'),
  };
}

export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, 12);
}

// Get encryption key from environment variable
function getEncryptionKey(): string {
  const key = process.env.APP_TOKENS_KEY;
  if (!key) {
    throw new Error('APP_TOKENS_KEY environment variable is required');
  }
  if (key.length !== 32) {
    throw new Error('APP_TOKENS_KEY must be exactly 32 characters long');
  }
  return key;
}

/**
 * Encrypt a token using AES-256-GCM
 */
export async function encryptToken(token: string): Promise<Buffer> {
  try {
    const key = getEncryptionKey();
    
    // Generate random IV and salt
    const iv = randomBytes(16);
    const salt = randomBytes(32);
    
    // Derive key using scrypt
    const derivedKey = await scryptAsync(key, salt, 32) as Buffer;
    
    // Create cipher
    const cipher = createCipheriv(algorithm, derivedKey, iv);
    
    // Encrypt the token
    let encrypted = cipher.update(token, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine all components: salt + iv + authTag + encrypted data
    const result = Buffer.concat([
      salt,           // 32 bytes
      iv,             // 16 bytes  
      authTag,        // 16 bytes
      encrypted       // variable length
    ]);
    
    return result;
    
  } catch (error) {
    console.error('Token encryption failed:', error);
    throw new Error('Failed to encrypt token');
  }
}

/**
 * Decrypt a token using AES-256-GCM
 */
export async function decryptToken(encryptedData: Buffer): Promise<string> {
  try {
    const key = getEncryptionKey();
    
    if (encryptedData.length < 64) { // 32 + 16 + 16 = 64 minimum bytes
      throw new Error('Invalid encrypted data length');
    }
    
    // Extract components
    const salt = encryptedData.subarray(0, 32);
    const iv = encryptedData.subarray(32, 48);
    const authTag = encryptedData.subarray(48, 64);
    const encrypted = encryptedData.subarray(64);
    
    // Derive key using scrypt
    const derivedKey = await scryptAsync(key, salt, 32) as Buffer;
    
    // Create decipher
    const decipher = createDecipheriv(algorithm, derivedKey, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
    
  } catch (error) {
    console.error('Token decryption failed:', error);
    throw new Error('Failed to decrypt token');
  }
}

/**
 * Generate a secure random key for APP_TOKENS_KEY
 * This is a utility function for setup
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex').substring(0, 32);
}

/**
 * Rotate tokens by re-encrypting with new key
 * Used when rotating encryption keys
 */
export async function rotateTokenEncryption(
  oldEncryptedData: Buffer,
  oldKey: string,
  newKey: string
): Promise<Buffer> {
  // Temporarily set old key
  const originalKey = process.env.APP_TOKENS_KEY;
  process.env.APP_TOKENS_KEY = oldKey;
  
  try {
    // Decrypt with old key
    const token = await decryptToken(oldEncryptedData);
    
    // Set new key
    process.env.APP_TOKENS_KEY = newKey;
    
    // Encrypt with new key
    const newEncryptedData = await encryptToken(token);
    
    return newEncryptedData;
    
  } finally {
    // Restore original key
    process.env.APP_TOKENS_KEY = originalKey;
  }
}

/**
 * Validate that a token can be encrypted and decrypted
 * Useful for testing encryption setup
 */
export async function validateEncryption(): Promise<boolean> {
  try {
    const testToken = 'test_token_' + Date.now();
    const encrypted = await encryptToken(testToken);
    const decrypted = await decryptToken(encrypted);
    
    return testToken === decrypted;
  } catch (error) {
    console.error('Encryption validation failed:', error);
    return false;
  }
}

/**
 * Safe token display for logging (shows only first/last few characters)
 */
export function maskToken(token: string): string {
  if (token.length <= 8) {
    return '*'.repeat(token.length);
  }
  return token.substring(0, 4) + '*'.repeat(token.length - 8) + token.substring(token.length - 4);
}

/**
 * Generic encrypt function (alias for encryptToken)
 */
export async function encrypt(data: string): Promise<Buffer> {
  return encryptToken(data);
}

/**
 * Generic decrypt function (alias for decryptToken) 
 */
export async function decrypt(encryptedData: Buffer): Promise<string> {
  return decryptToken(encryptedData);
}
